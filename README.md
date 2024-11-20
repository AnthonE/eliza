# Twitter Watch Client for AI16Z/Eliza

A Twitter client component that processes specific tweets and monitors users' timelines. This client is part of the larger Twitter integration for Eliza agents.

## Features

- Process specific tweet IDs once (provided through configuration)
- Monitor specified Twitter users' timelines for new tweets
- Rate limit aware with built-in delays
- Caches last check times to avoid duplicate processing of timeline tweets

## Configuration

Create a `.env` file in your project root with the following required variables:

```env
# Twitter API Credentials
TWITTER_API_KEY=your_api_key

# Bot Configuration
TWITTER_WATCH_TWEETS=tweet_id_1,tweet_id_2,tweet_id_3  # Tweets to process once
TWITTER_WATCH_USERS=username1,username2,username3      # Users to monitor continuously
```

### Environment Variables Explained

- `TWITTER_WATCH_TWEETS`: Comma-separated list of tweet IDs that will be processed once
- `TWITTER_WATCH_USERS`: Comma-separated list of usernames whose timelines you want to continuously monitor

## How It Works

### Tweet Processing
- Tweet IDs provided in `TWITTER_WATCH_TWEETS` are processed once when the client starts
- Each tweet is processed through `handleTweet` method which can respond to the tweet based on your agent's configuration

### User Timeline Monitoring
- For each username in `TWITTER_WATCH_USERS`, the client continuously checks for new tweets
- Uses a caching system to keep track of the last checked time for each user
- Only processes new tweets that appear after the last check
- Monitors are cleaned up properly when users are removed from configuration

## Integration

The watch client is integrated into the main Twitter client in `client-twitter/index.ts`:

```typescript
import { TwitterWatchClient } from "./watch.ts";
import { IAgentRuntime, Client } from "@ai16z/eliza";

class TwitterAllClient {
    watch: TwitterWatchClient;
    // ... other clients

    constructor(runtime: IAgentRuntime) {
        this.watch = new TwitterWatchClient(runtime); //check individual tweet ids and a list of users to watch
        // ... other client initializations
    }
}
```

## Cache Management

The client maintains a cache in the `tweetcache` directory to track:
- Last checked timestamps for each watched user
- Timeline processing history

The cache directory is automatically created if it doesn't exist.

## Rate Limiting

The client implements automatic rate limit handling:
- 1-second delay between processing tweets
- Uses Twitter API v2 endpoints for efficient rate limit usage
- Properly formats timestamps to comply with Twitter's API requirements

## Important Notes

- The client uses Twitter API v2
- Timestamps are stored in ISO format
- Each user watcher runs independently
- Timeline monitoring excludes retweets and replies by default
- Maximum of 10 tweets fetched per user timeline check

## Debugging

Logs are provided for:
- Watch start/stop events
- Tweet processing status
- API errors
- Cache operations

Check these logs if you need to troubleshoot the client operation.

# Eliza 🤖

<div align="center">
  <img src="./docs/static/img/eliza_banner.jpg" alt="Eliza Banner" width="100%" />
</div>

<div align="center">
  
  📖 [Documentation](https://ai16z.github.io/eliza/) | 🎯 [Examples](https://github.com/thejoven/awesome-eliza)
  
</div>

## ✨ Features

-   🛠️ Full-featured Discord, Twitter and Telegram connectors
-   🔗 Support for every model (Llama, Grok, OpenAI, Anthropic, etc.)
-   👥 Multi-agent and room support
-   📚 Easily ingest and interact with your documents
-   💾 Retrievable memory and document store
-   🚀 Highly extensible - create your own actions and clients
-   ☁️ Supports many models (local Llama, OpenAI, Anthropic, Groq, etc.)
-   📦 Just works!

## 🎯 Use Cases

-   🤖 Chatbots
-   🕵️ Autonomous Agents
-   📈 Business Process Handling
-   🎮 Video Game NPCs
-   🧠 Trading

## 🌍 Translations

<details>
<summary>Available Languages</summary>

-   [中文说明](./README_CN.md)
-   [日本語の説明](./README_JA.md)
-   [한국어 설명](./README_KOR.md)
-   [Instructions en français](./README_FR.md)
-   [Instruções em português](./README_PTBR.md)

</details>

## 🚀 Quick Start

### Prerequisites

-   [Python 2.7+](https://www.python.org/downloads/)
-   [Node.js 22+](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
-   [pnpm](https://pnpm.io/installation)

> **Note for Windows Users:** WSL is required

### Edit the .env file

Copy .env.example to .env and fill in the appropriate values

```
cp .env.example .env
```

### Automatically Start Eliza

This will run everything to setup the project and start the bot with the default character.

```bash
sh scripts/start.sh
```

### Edit the character file

1. Open `packages/agent/src/character.ts` to modify the default character. Uncomment and edit.

2. To load custom characters:
    - Use `pnpm start --characters="path/to/your/character.json"`
    - Multiple character files can be loaded simultaneously

### Manually Start Eliza

```bash
pnpm i
pnpm build
pnpm start

# The project iterates fast, sometimes you need to clean the project if you are coming back to the project
pnpm clean
```

#### Additional Requirements

You may need to install Sharp. If you see an error when starting up, try installing it with the following command:

```
pnpm install --include=optional sharp
```

### Community & contact

-   [GitHub Issues](https://github.com/ai16z/eliza/issues). Best for: bugs you encounter using Eliza, and feature proposals.
-   [Discord](https://discord.gg/ai16z). Best for: sharing your applications and hanging out with the community.

## Contributors

<a href="https://github.com/ai16z/eliza/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ai16z/eliza" />
</a>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ai16z/eliza&type=Date)](https://star-history.com/#ai16z/eliza&Date)

