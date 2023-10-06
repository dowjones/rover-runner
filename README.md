# Rover Runner README
Welcome to the Rover Runner! With this extension you can run your supergraph on your local machine using a mix of local and Apollo-based variant subgraphs

![Menu Screenshot](https://github.com/dowjones/rover-runner/blob/main/media/menuScreenshot.png)
 
## Features

This extension let's you do the following:
- Run any subgraph locally normally or with the debugger
- Run any subgraph from a variant from Apollo Studio
- Set the environment variables required to run the subgraphs by hitting the gear icon

## Requirements

Make sure you have the Rover CLI installed! You can get this at: https://www.apollographql.com/docs/rover/getting-started

This extension requires a `supergraph.json` file at `.rover-runner/supergraph.json` with the following format:
``` json
{
  "subgraphs": {
    "Subgraph1": {
      "path": "",
      "localUrl": "http://localhost:3000/graphql"
    },
    "Subgraph2": {
      "path": "subgraphs/subgraph2",
      "localUrl": "http://localhost:3001/graphql"
    },
    "Subgraph3": {
      "path": "subgraphs/subgraph3",
      "localUrl": "http://localhost:3002/graphql",
      "devUrl": "https://sampleendpointoverridingstudioconfig.com/graphql"
    }
  },
  "supergraphs": {
    "Supergraph1": ["Subgraph1", "Subgraph3"],
    "Supergraph2": ["Subgraph2", "Subgraph3"]
  }
}
```
Some notes about this format:
- `Subgraph1`, `Subgraph2`, etc are the subgraph names and should match the names in Apollo Studio
- `path` is the relative path to the subgraph from the workspace root. If this is blank like in `Subgraph1`, then you need to run the subgraph on its own 
- `localUrl` is the graphQL endpoint when running the subgraph locally
- `devUrl` is the graphQL endpoint for the GraphQL variant. This field is optional as the extension will grab the endpoint from Apollo Studio by default

Lastly, this extension also requires a `router.yaml` file at `.rover-runner/router.yaml`.

## Known Issues

- The `Run All` button sometimes has some concurrency issues
- If you stop the first subgraph that you ran, then the whole router will shut down. This is an intentional behavior done by Rover and there is nothing we can do about it.

## Release Notes

### 0.2.4

Add description to extension

### 0.2.3

README updated for open source

### 0.2.2

Open Source Release

## For Devs

Make sure the root folder in your workspace is `rover-runner` or else you won't be able to debug the app

### Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
