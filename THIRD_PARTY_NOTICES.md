# 第三方软件说明

本 Plugin 使用以下开源软件构建本地 MCP Server 与 MCP Apps 问卷。运行文件已经打包，无需联网加载这些依赖。

| 软件 | 锁定版本 | 用途 | 许可文件 |
| --- | --- | --- | --- |
| `@modelcontextprotocol/ext-apps` | 1.7.5 | MCP Apps UI 与宿主通信 | [modelcontextprotocol-ext-apps-LICENSE.txt](licenses/modelcontextprotocol-ext-apps-LICENSE.txt) |
| `@modelcontextprotocol/sdk` | 1.30.0 | MCP Server 与 stdio 传输 | [modelcontextprotocol-sdk-LICENSE.txt](licenses/modelcontextprotocol-sdk-LICENSE.txt) |
| `zod` | 4.5.4 | MCP 工具输入校验 | [zod-LICENSE.txt](licenses/zod-LICENSE.txt) |
| `esbuild` | 0.28.2 | 仅用于开发构建 | [esbuild-LICENSE.txt](licenses/esbuild-LICENSE.txt) |

具体依赖版本和间接依赖记录在 `package-lock.json`。各软件名称和商标归其权利人所有。
