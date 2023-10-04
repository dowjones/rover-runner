// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, ExtensionContext, window, workspace } from 'vscode';
import { selectUrl, shouldRunDebug } from './quickPicks';
import { SubgraphsProvider } from './SubgraphsProvider';
import { startRedis, stopRedis } from './redis';
import { generateTemplate } from './setup';
import { Subgraph, startup } from './Subgraph';
import { Supergraph } from './Supergraph';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  context.workspaceState.update('RoverRunnerRunning', 0);
  const rootPath: string =
    workspace.workspaceFolders && workspace.workspaceFolders.length > 0 ? workspace.workspaceFolders[0].uri.fsPath : '';

  const subgraphsProvider = new SubgraphsProvider(rootPath, context);
  window.createTreeView('subgraphsList', {
    treeDataProvider: subgraphsProvider,
  });

  context.subscriptions.push(
    commands.registerCommand('rover-runner.GenerateTemplate', () => generateTemplate(rootPath))
  );
  context.subscriptions.push(
    commands.registerCommand('subgraphsList.setEnvironmentVariables', () => {
      commands.executeCommand('workbench.action.openSettings', 'Rover Runner');
    })
  );
  context.subscriptions.push(
    commands.registerCommand('rover-runner.SelectSubgraphUrl', (subgraph: Subgraph) =>
      selectUrl(rootPath, subgraph, context)
    )
  );
  // Refresh the TreeDataProvider
  context.subscriptions.push(commands.registerCommand('subgraphsList.refreshEntry', () => subgraphsProvider.refresh()));

  context.subscriptions.push(
    commands.registerCommand('rover-runner.runSubgraph', (subgraph: Subgraph) => {
      console.log(`Running ${subgraph.label} at ${subgraph.getUrl()}`);
      if (workspace.getConfiguration().get('rover-runner.useRedis')) {
        startRedis();
      }
      // Offer option to run in debug if running locally and has access to the repo
      if (subgraph.getCurrent() === 'localUrl' && subgraph.filePath) {
        shouldRunDebug().then((item) => startup(subgraph, item === 'Run in Debug Mode', context));
      } else {
        startup(subgraph, false, context);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('rover-runner.stopSubgraph', (subgraph: Subgraph) => {
      console.log(`Stopping ${subgraph.label} at ${subgraph.getUrl()}`);
      subgraph.stopRunning().then((name) => {
        context.workspaceState.update(name, 'StoppedSubgraph');
        commands.executeCommand('subgraphsList.refreshEntry');
      });
    })
  );

  context.subscriptions.push(
    commands.registerCommand('rover-runner.runSupergraph', (supergraph: Supergraph) => {
      if (context.workspaceState.get('RoverRunnerRunning', 0)) {
        window.showErrorMessage(`Another process is already running in Rover Runner!`);
        return;
      }
      context.workspaceState.update('RoverRunnerRunning', 1);

      if (workspace.getConfiguration().get('rover-runner.useRedis')) {
        startRedis();
      }
      console.log(`Running ${supergraph.label} supergraph`);
      shouldRunDebug()
        .then((item) => {
          // If not expanded then we need to get the supergraph's subgraphs
          if (!supergraph.children) {
            subgraphsProvider.getChildren(supergraph);
          }
          return supergraph.runSupergraph(item === 'Run in Debug Mode', context);
        })
        .then(
          (name) => {
            console.log(`Running ${name} supergraph`);
            context.workspaceState.update(`${name}Supergraph`, 'RunningSupergraph');
            commands.executeCommand('subgraphsList.refreshEntry');
          },
          (error) => {
            window.showErrorMessage(error);
            context.workspaceState.update('RoverRunnerRunning', 0);
          }
        );
    })
  );

  context.subscriptions.push(
    commands.registerCommand('rover-runner.stopSupergraph', (supergraph: Supergraph) => {
      console.log(`Stopping ${supergraph.label}`);
      supergraph.stopRunning(context).then(
        () => {
          context.workspaceState.update('RoverRunnerRunning', 0);
          commands.executeCommand('subgraphsList.refreshEntry');
        },
        (error) => {
          window.showErrorMessage(error);
        }
      );
    })
  );

  context.subscriptions.push(
    commands.registerCommand('rover-runner.stopAllSubgraphs', () => {
      subgraphsProvider
        .getChildren()
        .then((supergraphs) => {
          const stopList: Promise<string>[] = [];
          supergraphs.forEach((supergraph) => {
            if (supergraph instanceof Supergraph) {
              stopList.push(supergraph.stopRunning(context));
            }
            // This case should never occur but it is included for defensive coding
            else if (supergraph instanceof Subgraph) {
              stopList.push(
                supergraph.stopRunning().then((name) => {
                  context.workspaceState.update(name, 'StoppedSubgraph');
                  return name;
                })
              );
            }
          });
          return Promise.resolve(stopList);
        })
        .then((stopList) => {
          console.log('stopping stuff');
          Promise.all(stopList)
            .then(() => {
              context.workspaceState.update('RoverRunnerRunning', 0);
              stopRedis();
              commands.executeCommand('subgraphsList.refreshEntry');
            })
            .catch((error) => {
              console.log(error);
              window.showErrorMessage('Something went wrong stopping all subgraphs! Check out the logs for more info');
            });
        });
    })
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  commands.executeCommand('rover-runner.stopAllSubgraphs');
}
