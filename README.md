## 基于 Flowise 进行二次开发

<h3>Build AI Agents, Visually</h3>
<a href="https://github.com/FlowiseAI/Flowise">
<img width="100%" src="https://github.com/FlowiseAI/Flowise/blob/main/images/flowise_agentflow.gif?raw=true"></a>

## 📚 Table of Contents

-   [⚡ Quick Start](#-quick-start)
-   [🐳 Docker](#-docker)
-   [👨‍💻 Developers](#-developers)
-   [🌱 Env Variables](#-env-variables)
-   [📖 Documentation](#-documentation)
-   [📄 License](#-license)

## ⚡Quick Start

Download and Install [NodeJS](https://nodejs.org/en/download) >= 18.15.0

1. Install Flowise
    ```bash
    npm install -g flowise
    ```
2. Start Flowise

    ```bash
    npx flowise start
    ```

3. Open [http://localhost:3000](http://localhost:3000)

## 🐳 Docker

### Docker Compose

1. Clone the Flowise project
2. Go to `docker` folder at the root of the project
3. Copy `.env.example` file, paste it into the same location, and rename to `.env` file
4. `docker compose up -d`
5. Open [http://localhost:3000](http://localhost:3000)
6. You can bring the containers down by `docker compose stop`

### Docker Image

1. Build the image locally:

    ```bash
    docker build --no-cache -t flowise .
    ```

2. Run image:

    ```bash
    docker run -d --name flowise -p 3000:3000 flowise
    ```

3. Stop image:

    ```bash
    docker stop flowise
    ```

## 👨‍💻 Developers

Flowise has 3 different modules in a single mono repository.

-   `server`: Node backend to serve API logics
-   `ui`: React frontend
-   `components`: Third-party nodes integrations
-   `api-documentation`: Auto-generated swagger-ui API docs from express

### Prerequisite

-   Install [PNPM](https://pnpm.io/installation)
    ```bash
    npm i -g pnpm
    ```

### Setup

1.  Clone the repository:

    ```bash
    git clone https://github.com/FlowiseAI/Flowise.git
    ```

2.  Go into repository folder:

    ```bash
    cd Flowise
    ```

3.  Install all dependencies of all modules:

    ```bash
    pnpm install
    ```

4.  Build all the code:

    ```bash
    pnpm build
    ```

    <details>
    <summary>Exit code 134 (JavaScript heap out of memory)</summary>  
    If you get this error when running the above `build` script, try increasing the Node.js heap size and run the script again:

    ```bash
    # macOS / Linux / Git Bash
    export NODE_OPTIONS="--max-old-space-size=4096"

    # Windows PowerShell
    $env:NODE_OPTIONS="--max-old-space-size=4096"

    # Windows CMD
    set NODE_OPTIONS=--max-old-space-size=4096
    ```

    Then run:

    ```bash
    pnpm build
    ```

    </details>

5.  Start the app:

    ```bash
    pnpm start
    ```

    You can now access the app on [http://localhost:3000](http://localhost:3000)

6.  For development build:

    -   Create `.env` file and specify the `VITE_PORT` (refer to `.env.example`) in `packages/ui`
    -   Create `.env` file and specify the `PORT` (refer to `.env.example`) in `packages/server`
    -   Run:

        ```bash
        pnpm dev
        ```

    Any code changes will reload the app automatically on [http://localhost:8080](http://localhost:8080)

## 📖 Documentation

You can view the Flowise Docs [here](https://docs.flowiseai.com/)

## 📄 License

Source code in this repository is made available under the [Apache License Version 2.0](LICENSE.md).

## 其他

React 18 的 StrictMode 在开发模式下会故意将 useEffect 执行两次（挂载 → 卸载 → 重新挂载），以帮助发现副作用问题。这导致所有通过 useEffect 发起的 API 请求都被调用两次。

为什么 login 不受影响？
Login 是由用户点击按钮触发的（signIn.jsx:88 loginApi.request(body)），而不是 useEffect，所以不受 StrictMode 双调影响。

注意： 这只影响开发模式（npm run dev），生产构建中 effects 只执行一次。

## 导入技能包扩展

业界没有 "OpenClaw" 的标准，我参照 Claude Code Skill + OpenAI Plugin manifest 设计如下（zip 包结构）：
my-skill.zip
├── manifest.json # 必须
└── entry/
├── handler.js # type=code 时使用
├── prompt.md # type=llm 时使用
└── api.yaml # type=api 时使用（任选其一）

-   仅接收 .zip / .json 文件,使用实例：

```json
{
    "name": "weatherSkill",
    "description": "Get current weather for a city",
    "type": "api",
    "inputs": [{ "property": "city", "type": "string", "required": true }],
    "config": {
        "url": "https://api.weather.com/v1?city=${city}",
        "method": "GET",
        "headers": { "Authorization": "Bearer ${vars.WEATHER_KEY}" }
    }
}
```

-   支持 python 技能包
    冷启动每次约 1–2s，热路径再快。如果未来要解决冷启动，可以考虑 sandbox 池化，但目前先保持简单。
