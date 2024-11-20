import { TwitterPostClient } from "./post.ts";
import { TwitterSearchClient } from "./search.ts";
import { TwitterInteractionClient } from "./interactions.ts";
import { TwitterWatchClient } from "./watch.ts";
import { IAgentRuntime, Client } from "@ai16z/eliza";

class TwitterAllClient {
    post: TwitterPostClient;
    search: TwitterSearchClient;
    interaction: TwitterInteractionClient;
    watch : TwitterWatchClient;
    constructor(runtime: IAgentRuntime) {
        this.watch = new TwitterWatchClient(runtime); //check individual tweet ids and a list of users to watch
        this.post = new TwitterPostClient(runtime);// post tweets to twitter
        // this.search = new TwitterSearchClient(runtime); // don't start the search client by default
        // this searches topics from character file, but kind of violates consent of random users
        // burns your rate limit and can get your account banned
        // use at your own risk
        this.interaction = new TwitterInteractionClient(runtime);// responds to tweets
    }
}

export const TwitterClientInterface: Client = {
    async start(runtime: IAgentRuntime) {
        console.log("Twitter client started");
        return new TwitterAllClient(runtime);
    },
    async stop(runtime: IAgentRuntime) {
        console.warn("Twitter client does not support stopping yet");
    },
};

export default TwitterClientInterface;
