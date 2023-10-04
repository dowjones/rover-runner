import * as vscode from 'vscode';
import { setTimeout } from 'timers/promises';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import detect from 'detect-port';
import * as cp from 'child_process';
import { join } from 'path';
import { SupergraphBlock } from './supergraphYaml';

/**
 * Run a given subgraph and refresh the view to show the subgraph's updated state
 * @param subgraph
 * @param debug
 */
export const startup = (
  subgraph: Subgraph,
  debug: boolean,
  context: vscode.ExtensionContext,
  shouldRefresh: boolean = true
) => {
  const subgraphStartupFulfilled = (name: string) => {
    context.workspaceState.update(name, 'RunningSubgraph');
    if (shouldRefresh) {
      vscode.commands.executeCommand('subgraphsList.refreshEntry');
    }
  };
  const subgraphStartupRejected = (errorMessage: string) => {
    vscode.window.showErrorMessage(errorMessage);
  };
  subgraph.startRunning(debug).then(subgraphStartupFulfilled, subgraphStartupRejected);
};

export class Subgraph extends vscode.TreeItem {
  filePath: string;
  constructor(
    public readonly label: string,
    private current: string,
    public local: string,
    public dev: string,
    contextValue: string,
    filePath: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.tooltip = filePath;
    this.current = current;
    this.description = current === 'devUrl' ? 'Apollo' : 'Local';
    this.contextValue = contextValue;
    this.filePath = filePath;
  }

  public getCurrent() {
    return this.current;
  }

  public getUrl() {
    if (this.current === 'devUrl') {
      return this.dev;
    } else {
      return this.local;
    }
  }

  public setUrl(urlType: string) {
    this.current = urlType;
    this.description = this.current === 'devUrl' ? 'Apollo' : 'Local';
  }

  public setLocal(url: string) {
    this.local = url;
  }

  /**
   * Set the subgraph's dev url.
   */
  public setDev(url: string) {
    this.dev = url;
  }

  public getSupergraphBlock(): SupergraphBlock {
    const url = this.getUrl();
    const supergraphBlock: SupergraphBlock = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      routing_url: url,
      schema: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        subgraph_url: url,
      },
    };
    const authHeader = vscode.workspace.getConfiguration().get('rover-runner.authorizationHeader', '');
    if (authHeader.length) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      supergraphBlock.schema.introspection_headers = { Authorization: authHeader };
    }
    return supergraphBlock;
  }

  public introspectSchema(url: string): Promise<string> {
    try {
      // Add auth header if Bearer Token set
      const authHeader = vscode.workspace.getConfiguration().get('rover-runner.authorizationHeader', '');
      process.env.ROV_TOK = authHeader;
      let introspectionQuery = authHeader.length
        ? `rover subgraph introspect ${url} --header "Authorization: $ROV_TOK" --output ${this.label}.graphql`
        : `rover subgraph introspect ${url} --output ${this.label}.graphql`;
      const workspacePath = join(vscode.workspace?.workspaceFolders?.[0]?.uri?.fsPath || '', '.rover-runner/');
      cp.execSync(introspectionQuery, {
        cwd: workspacePath,
        env: process.env,
      });
      return Promise.resolve('');
    } catch (e: any) {
      console.log(e?.message);
      return Promise.reject(`Introspection failed at ${url}. Make sure Auth is up to date`);
    }
  }

  public async runLocally(debug: boolean): Promise<string> {
    if (!this.filePath) {
      vscode.window.showInformationMessage(
        "Run the subgraph on your local machine! You might need to stop and play again if the subgraph isn't running"
      );
      await setTimeout(5000);
      this.contextValue = 'RunningSubgraph';
      return Promise.resolve('Path not provided');
    } else if (debug) {
      this.setLaunchJson();
      let folder = vscode.workspace.workspaceFolders?.[0];
      await vscode.debug.startDebugging(folder, this.label, {
        suppressDebugToolbar: false,
      });
      this.contextValue = 'RunningSubgraph';
      return Promise.resolve('Launched in debug mode');
    } else {
      let subgraphTerminal =
        vscode.window.terminals.find((i) => i.name === this.label) || vscode.window.createTerminal(this.label);
      subgraphTerminal.show(true);
      subgraphTerminal.sendText(
        `if [[ "$PWD" =~ .*"${this.filePath}".* ]]; then npm run start; else cd ${this.filePath} && npm run start; fi`
      );
      await setTimeout(3000);
      this.contextValue = 'RunningSubgraph';
      return Promise.resolve('Launched in normal mode');
    }
  }

  public async startRunning(debug: boolean): Promise<string> {
    this.contextValue = 'RunningSubgraph';
    let roverTerminal =
      vscode.window.terminals.find((i) => i.name === `Rover ${this.label}`) ||
      vscode.window.createTerminal(`Rover ${this.label}`);
    roverTerminal.sendText(`
      export APOLLO_GRAPH_REF=${vscode.workspace.getConfiguration().get('apolloStudioConfiguration.apolloGraphRef')}
      export APOLLO_KEY=${vscode.workspace.getConfiguration().get('apolloStudioConfiguration.apolloKey')}
      export APOLLO_ROVER_DEV_ROUTER_VERSION=${vscode.workspace.getConfiguration().get('rover-runner.routerVersion')}
      export ROVER_TOK="${vscode.workspace.getConfiguration().get('rover-runner.authorizationHeader')}"`);

    if (this.current === 'localUrl') {
      await this.runLocally(debug);
      await setTimeout(3000);
      roverTerminal.show(true);
      // Make sure the subgraph is running before trying to run rover
      let port: number = parseInt(this.local.split(':')?.[2]?.split('/')?.[0]);
      return await detect(port).then((_port: number) => {
        // _port is the next available port so if equal then server isn't running
        if (port === _port && this.filePath) {
          roverTerminal.sendText(
            `echo The ${this.label} subgraph is not running. Please check for errors in the terminal and then try again`
          );
          this.contextValue = 'StoppedSubgraph';
          return Promise.reject(
            `The ${this.label} subgraph is not running. Please check for errors in the terminal and then try again`
          );
        } else if (port === _port && !this.filePath) {
          this.contextValue = 'StoppedSubgraph';
          return Promise.reject(
            `The ${this.label} subgraph is not running. Please add a filepath in supergraph.json or run the subgraph yourself`
          );
        } else {
          roverTerminal.sendText('cd .rover-runner');
          return this.introspectSchema(this.local).then(
            () => {
              roverTerminal.sendText(`
                    rover dev --router-config ./router.yaml --name ${this.label} --schema ${this.label}.graphql --url ${this.local} --elv2-license=accept
                    `);
              return Promise.resolve(this.label);
            },
            (message) => {
              return Promise.reject(message);
            }
          );
        }
      });
    } else if (this.current === 'devUrl') {
      roverTerminal.show(true);
      roverTerminal.sendText('cd .rover-runner');
      return this.introspectSchema(this.dev).then(
        () => {
          roverTerminal.sendText(`
            rover dev --router-config ./router.yaml --name ${this.label} --schema ${this.label}.graphql --url ${this.dev} --elv2-license=accept
            `);
          return Promise.resolve(this.label);
        },
        (message) => {
          return Promise.reject(message);
        }
      );
    }
    return Promise.reject(`Subgraph ${this.label} is malformed`);
  }

  public async stopRunning(): Promise<string> {
    return new Promise(async (resolve) => {
      this.contextValue = 'StoppedSubgraph';
      let roverTerminal = vscode.window.terminals.find((i) => i.name === `Rover ${this.label}`);
      if (roverTerminal) {
        roverTerminal.sendText('\u0003');
        await setTimeout(3000);
        roverTerminal.dispose();
      }

      if (this.current === 'localUrl') {
        let subgraphTerminal = vscode.window.terminals.find((i) => i.name === this.label);
        if (subgraphTerminal) {
          subgraphTerminal.sendText('\u0003');
          await setTimeout(3000);
          subgraphTerminal.dispose();
        }
      }
      resolve(this.label);
    });
  }

  setLaunchJson = () => {
    let fileP: string = vscode.workspace.workspaceFolders?.[0].uri.path + '/.vscode/launch.json';
    let launchFile = existsSync(fileP) ? readFileSync(fileP, 'utf-8') : undefined;
    let launchJson = launchFile ? JSON.parse(launchFile) : {};

    if (!launchJson || !launchJson?.configurations) {
      launchJson = {
        version: '0.2.0',
        configurations: [],
      };
    }

    // Check if launch.json has the configuration
    let launchConfExists = false;
    launchJson?.configurations?.forEach((conf: { name: string }) => {
      if (conf?.name === this.label) {
        launchConfExists = true;
      }
    });
    if (!launchConfExists) {
      launchJson.configurations.push({
        type: 'node',
        request: 'launch',
        name: this.label,
        program: '${workspaceRoot}' + `/${this.filePath}/server.js`,
        skipFiles: ['<node_internals>/**'],
        // eslint-disable-next-line @typescript-eslint/naming-convention
        env: { NODE_ENV: 'local' },
        console: 'integratedTerminal',
      });
      writeFileSync(fileP, JSON.stringify(launchJson, null, 2), 'utf-8');
    }
  };
}
