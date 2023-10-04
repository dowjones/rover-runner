/* eslint-disable @typescript-eslint/naming-convention */

import { writeFile } from 'fs/promises';
import { workspace } from 'vscode';
import { stringify } from 'yaml';

export interface SupergraphYaml {
  federation_version: string;
  subgraphs: {
    [key: string]: SupergraphBlock;
  };
}

export interface SupergraphBlock {
  routing_url: string;
  schema: {
    subgraph_url: string;
    introspection_headers?: {
      Authorization: string;
    };
  };
}

export const writeSupergraphYaml = (supergraph: SupergraphYaml) : Promise<void> => {
  const formattedSupergraphYaml = stringify(supergraph);
  const filePath: string = workspace.workspaceFolders?.[0].uri.path + '/.rover-runner/supergraph.yaml';
  return writeFile(filePath, formattedSupergraphYaml, 'utf-8');
};
