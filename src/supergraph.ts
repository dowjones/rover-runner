import { readFileSync } from 'fs';
import { setTimeout } from 'timers/promises';
import { fetchSubgraphUrls, makePathAbsolute } from './setup';
import { ExtensionContext, TreeItem, TreeItemCollapsibleState, window, workspace } from 'vscode';
import { SupergraphYaml, writeSupergraphYaml } from './supergraphYaml';
import { Subgraph } from './Subgraph';

export class Supergraph extends TreeItem {
  children: Subgraph[];
  constructor(
    public readonly label: string,
    contextValue: string,
    public readonly collapsibleState: TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
    this.children = [];
  }

  public setChildren(children: Subgraph[]) {
    this.children = children;
  }

  async getChildren(configPath: string, context: ExtensionContext): Promise<Subgraph[]> {
    const toSubgraph = (subgraphName: string): Subgraph[] => {
      const apolloDevUrl =
        apolloSubgraphs.data.variant?.subgraphs.find((e: any) => e['name'] === subgraphName)?.url ?? '';
      const subgraphConfig = configJson.subgraphs[subgraphName];
      if (!subgraphConfig) {
        window.showErrorMessage(`Subgraph ${subgraphName} in supergraph has no match in the subgraphs list`);
        return [];
      }
      const usedDevUrl = subgraphConfig?.devUrl ?? apolloDevUrl;
      // Can either be devUrl or localUrl
      const current = context.workspaceState.get(subgraphName + 'currentUrl', 'devUrl');
      // Can either be Stopped or Running
      const contextValue = context.workspaceState.get(subgraphName, 'StoppedSubgraph');
      const filePath = makePathAbsolute(subgraphConfig.path, configPath);
      return [
        new Subgraph(
          subgraphName,
          current,
          subgraphConfig.localUrl,
          usedDevUrl,
          contextValue,
          filePath,
          TreeItemCollapsibleState.None
        ),
      ];
    };
    const apolloSubgraphs = await fetchSubgraphUrls();
    if (Object.keys(apolloSubgraphs).length === 0) {
      return Promise.reject();
    }

    const configJson = JSON.parse(readFileSync(configPath, 'utf-8'));

    let subgraphs: Subgraph[];
    if (this.label === 'All') {
      subgraphs = configJson?.subgraphs
        ? Object.keys(configJson.subgraphs).flatMap((subgraph: string) => toSubgraph(subgraph))
        : [];
    } else {
      subgraphs = configJson?.supergraphs?.[this.label]
        ? configJson?.supergraphs?.[this.label].flatMap((subgraph: string) => toSubgraph(subgraph))
        : [];
    }
    this.children = subgraphs;
    return subgraphs;
  }

  public async runSupergraph(debug: boolean, context: ExtensionContext): Promise<string> {
    this.contextValue = 'RunningSupergraph';
    const supergraphYaml: SupergraphYaml = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      federation_version: workspace.getConfiguration().get('rover-runner.federationVersion', '=2.3.2'),
      subgraphs: {},
    };
    const runChildren: Promise<string>[] = [];
    this.children.forEach(async (subgraph) => {
      // Check if subgraph is already running. This should never happen since supergraphs have to be the first thing to run. This is purely defensive coding
      if (subgraph.contextValue === 'RunningSubgraph' || subgraph instanceof Supergraph) {
        return Promise.reject(`Subgraph ${subgraph.label} is already running!`);
      }
      supergraphYaml.subgraphs[subgraph.label] = subgraph.getSupergraphBlock();
      if (subgraph.getCurrent() !== 'devUrl') {
        runChildren.push(
          subgraph.runLocally(debug).then(
            () => {
              console.log(`Running ${subgraph.label} at ${subgraph.getUrl()}`);
              context.workspaceState.update(subgraph.label, 'RunningSubgraph');
              return Promise.resolve('');
            },
            (err) => {
              return Promise.reject(err);
            }
          )
        );
      } else {
        subgraph.contextValue = 'RunningSubgraph';
        context.workspaceState.update(subgraph.label, 'RunningSubgraph');
      }
    });

    return Promise.all(runChildren)
      .then(() => writeSupergraphYaml(supergraphYaml))
      .then(
        () => {
          const roverTerminal =
            window.terminals.find((i) => i.name === `Rover Runner`) || window.createTerminal(`Rover Runner`);
          roverTerminal.show(true);
          roverTerminal.sendText(`
        export APOLLO_GRAPH_REF=${workspace.getConfiguration().get('apolloStudioConfiguration.apolloGraphRef')}
        export APOLLO_KEY=${workspace.getConfiguration().get('apolloStudioConfiguration.apolloKey')}
        export APOLLO_ROVER_DEV_ROUTER_VERSION=${workspace.getConfiguration().get('rover-runner.routerVersion')}
        `);
          roverTerminal.sendText('cd .rover-runner');
          roverTerminal.sendText(`rover dev --router-config ./router.yaml --supergraph-config ./supergraph.yaml`);
          return Promise.resolve(this.label);
        },
        // TODO If fail, then run stopSupergraph
        () => Promise.reject('Write Supergraph YAML Failed')
      );
  }

  public stopRunning(context: ExtensionContext): Promise<string> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      const roverTerminal = window.terminals.find((i) => i.name === `Rover Runner`);
      if (roverTerminal) {
        roverTerminal.sendText('\u0003');
        await setTimeout(3000);
        roverTerminal.dispose();
      }
      const stopList: Promise<void>[] = [];
      // Add subgraphs to a promise all
      this.children.forEach((subgraph) => {
        if (context.workspaceState.get(subgraph.label) === 'RunningSubgraph') {
          console.log(`Stopping ${subgraph.label} at ${subgraph.getUrl()}`);
          stopList.push(
            subgraph.stopRunning().then(
              (name) => context.workspaceState.update(name, 'StoppedSubgraph'),
              () => {
                reject(`Subgraph ${subgraph.label} failed to stop`);
              }
            )
          );
        }
      });
      return Promise.all(stopList).then(() => {
        this.contextValue = 'StoppedSupergraph';
        context.workspaceState.update(`${this.label}Supergraph`, 'StoppedSupergraph');
        return resolve(this.label);
      });
    });
  }
}
