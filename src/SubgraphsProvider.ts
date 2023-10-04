import * as vscode from 'vscode';
import { readFileSync, accessSync } from 'fs';
import { join } from 'path';
import { Subgraph } from './Subgraph';
import { Supergraph } from './Supergraph';
import { isApolloConfigured } from './setup';

export class SubgraphsProvider implements vscode.TreeDataProvider<Subgraph | Supergraph> {
  private _onDidChangeTreeData: vscode.EventEmitter<Subgraph | Supergraph | undefined | null | void> =
    new vscode.EventEmitter<Subgraph | Supergraph | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Subgraph | Supergraph | undefined | null | void> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  constructor(private workspaceRoot: string, private context: vscode.ExtensionContext) {}

  getTreeItem(element: Subgraph | Supergraph): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Subgraph | Supergraph): Thenable<Subgraph[] | Supergraph[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No Subgraphs in empty workspace');
      return Promise.resolve([]);
    }

    const configPath = join(
      this.workspaceRoot,
      `.rover-runner/${vscode.workspace.getConfiguration().get('rover-runner.supergraphConfigFilename')}`
    );
    if (this.pathExists(configPath)) {
      // if subgraph
      if (element instanceof Supergraph) {
        return Promise.resolve(element.getChildren(configPath, this.context));
      } else {
        if (!isApolloConfigured()) {
          vscode.commands.executeCommand('workbench.action.openSettings', 'Rover Runner');
          vscode.window.showErrorMessage('Please update Apollo variables and refresh');
          return Promise.reject();
        }
        return Promise.resolve(this.getSupergraphs(configPath));
      }
    } else {
      vscode.window.showInformationMessage(
        `Please create .rover-runner/${vscode.workspace
          .getConfiguration()
          .get('rover-runner.supergraphConfigFilename')} file`
      );
      return Promise.resolve([]);
    }
  }

  private getSupergraphs(configPath: string): Supergraph[] {
    const toSupergraph = (supergraphName: string, supergraph: []): Supergraph => {
      // Can either be Stopped or Running
      const contextValue = this.context.workspaceState.get(`${supergraphName}Supergraph`, 'StoppedSupergraph');
      const newSupergraph = new Supergraph(
        supergraphName,
        contextValue,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      newSupergraph.getChildren(configPath, this.context).then(
        (children) => newSupergraph.setChildren(children),
        () => vscode.window.showErrorMessage(`There was an error retrieving subgraphs from ${supergraphName}`)
      );
      return newSupergraph;
    };
    const configJson = JSON.parse(readFileSync(configPath, 'utf-8'));
    let supergraphs: Supergraph[] = [toSupergraph('All', [])];
    supergraphs = supergraphs.concat(
      configJson.supergraphs
        ? Object.keys(configJson.supergraphs).map((supergraph) =>
            toSupergraph(supergraph, configJson.supergraphs[supergraph])
          )
        : []
    );
    return supergraphs;
  }

  private pathExists(p: string): boolean {
    try {
      accessSync(p);
    } catch (err) {
      return false;
    }
    return true;
  }
}
