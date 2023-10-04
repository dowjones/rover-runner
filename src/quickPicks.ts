import { window, commands, ExtensionContext, ThemeIcon } from 'vscode';
import { readFileSync, writeFileSync } from 'fs';
import { Subgraph } from './Subgraph';

export const selectUrl = (rootPath: string, subgraph: Subgraph, context: ExtensionContext) => {
  const urlSelector = window.createQuickPick();
  urlSelector.items = [
    {
      label: 'Use Local Url',
      description: subgraph.local,
      buttons: [
        {
          iconPath: new ThemeIcon('edit'),
          tooltip: 'Edit Url',
        },
      ],
    },
    {
      label: 'Use Apollo Studio Url',
      description: subgraph.dev,
      buttons: [
        {
          iconPath: new ThemeIcon('edit'),
          tooltip: 'Edit Url',
        },
      ],
    },
  ];
  urlSelector.onDidChangeSelection(() => {
    let label = urlSelector.selectedItems[0].label || '';
    if (!label) {
      return;
    }
    subgraph.setUrl(label === 'Use Local Url' ? 'localUrl' : 'devUrl');
    context.workspaceState.update(subgraph.label + 'currentUrl', label === 'Use Local Url' ? 'localUrl' : 'devUrl');
    commands.executeCommand('subgraphsList.refreshEntry');
    urlSelector.dispose();
  });
  urlSelector.onDidTriggerItemButton((item) => {
    let placeHolder = item.item.label === 'Use Local Url' ? subgraph.local : subgraph.dev;
    window
      .showInputBox({
        ignoreFocusOut: true,
        prompt: `Please insert the new url`,
        title: `Set ${item.item.label.split(/\s(.*)/s)[1]}`,
        placeHolder: context.workspaceState.get(item.item.label, placeHolder),
      })
      .then((inp) => {
        if (!inp) {
          return;
        }
        let filePath = `${rootPath}/.rover-runner/${context.workspaceState.get(
          'Supergraph Configuration Filename',
          'supergraph.json'
        )}`;
        let supergraphJson = JSON.parse(readFileSync(filePath, 'utf-8'));
        let urlKey: string = item.item.label === 'Use Local Url' ? 'localUrl' : 'devUrl';
        supergraphJson.subgraphs[subgraph.label][urlKey] = inp;
        writeFileSync(filePath, JSON.stringify(supergraphJson, null, 2), 'utf-8');
        if (urlKey === 'localUrl') {
          subgraph.setLocal(inp);
        } else {
          subgraph.setDev(inp);
        }
      });
  });
  urlSelector.onDidHide(() => {
    urlSelector.dispose();
  });
  urlSelector.show();
};

/**
 * A QuickPick for deciding to run a subgraph normally or in the debugger
 */
export const shouldRunDebug = () =>
  window.showQuickPick(['Run Normally', 'Run in Debug Mode'], {
    placeHolder: 'Do you want to run in normal or debug mode?',
    canPickMany: false,
    ignoreFocusOut: true,
  });
