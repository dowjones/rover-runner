/* eslint-disable @typescript-eslint/naming-convention */
import { commands, window, workspace } from 'vscode';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import axios from 'axios';

export const sampleSupergraphJson = {
  subgraphs: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Subgraph1: {
      path: '',
      localUrl: 'http://localhost:3000/graphql',
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Subgraph2: {
      path: 'subgraphs/subgraph2',
      localUrl: 'http://localhost:3001/graphql',
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Subgraph3: {
      path: 'subgraphs/subgraph3',
      localUrl: 'http://localhost:3002/graphql',
      devUrl: 'https://sampleendpointoverridingstudioconfig.com/graphql',
    },
  },
  supergraphs: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Supergraph1: ['Subgraph1', 'Subgraph3'],
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Supergraph2: ['Subgraph2', 'Subgraph3'],
  },
};

export const generateTemplate = (rootPath: string) => {
  if (!existsSync(rootPath + '/.rover-runner')) {
    mkdirSync(rootPath + '/.rover-runner');
  }
  if (!existsSync(rootPath + '/.vscode')) {
    mkdirSync(rootPath + '/.vscode');
  }
  if (!existsSync(rootPath + '/.rover-runner/supergraph.json')) {
    writeFileSync(
      `${rootPath}/.rover-runner/supergraph.json`,
      JSON.stringify(sampleSupergraphJson, null, 2),
      'utf-8'
    );
    commands.executeCommand('subgraphsList.refreshEntry');
  }
};

export const isApolloConfigured = () => {
  if (
    workspace.getConfiguration().get('apolloStudioConfiguration.apolloKey', '')
      .length > 0 &&
    workspace
      .getConfiguration()
      .get('apolloStudioConfiguration.apolloGraphRef', '').length > 0
  ) {
    return true;
  }
  return false;
};

export const fetchSubgraphUrls = async () => {
  let apolloKey = workspace
    .getConfiguration()
    .get('apolloStudioConfiguration.apolloKey', '');
  let graphRef = workspace
    .getConfiguration()
    .get('apolloStudioConfiguration.apolloGraphRef', '');
  let body = {
    operationName: 'GetSubgraphUrls',
    query:
      'query GetSubgraphUrls($ref: ID!) { variant(ref: $ref) { ... on GraphVariant { subgraphs { name url }}  ... on InvalidRefFormat { message }}}',
    variables: { ref: graphRef },
  };
  return await axios
    .post('https://api.apollographql.com/graphql', body, {
      headers: {
        Connection: 'keep-alive',
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'apollographql-client-name': 'rover-runner',
        'apollographql-client-version': '0.1.0',
        'X-API-KEY': apolloKey,
      },
    })
    .then((response) => {
      if (response.status === 200) {
        return response.data;
      } else {
        const unexpectedResponse = `fetchSubgraphUrls status ${response.status} - ${response.statusText}`;
        console.log(unexpectedResponse);
        window.showErrorMessage(unexpectedResponse);
        return {};
      }
    })
    .catch((error) => {
      const errorResponse = `fetchSubgraphUrls status ${error.response.status} - ${error.response.statusText}`;
      console.log(errorResponse);
      window.showErrorMessage(errorResponse);
      return {};
    });
};

export const makePathAbsolute = (filePath: string, configPath: string) => {
  // If absolute or empty path, then return
  if (isAbsolute(filePath) || filePath.length === 0) {
    return filePath;
  }
  // Convert relative path to be absolute
  const workspaceRoot = configPath.split('.rover-runner')[0];
  return join(workspaceRoot, filePath);
};
