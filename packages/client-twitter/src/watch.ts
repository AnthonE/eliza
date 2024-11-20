import { SearchMode, Tweet } from "agent-twitter-client";
import fs from "fs";
import { composeContext } from "@ai16z/eliza";
import { generateMessageResponse, generateShouldRespond } from "@ai16z/eliza";
import { messageCompletionFooter, shouldRespondFooter } from "@ai16z/eliza";
import {
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
} from "@ai16z/eliza";
import { stringToUuid } from "@ai16z/eliza";
import { ClientBase } from "./base.ts";
import { buildConversationThread, sendTweet, wait } from "./utils.ts";
import { TwitterApi } from "twitter-api-v2";

export const twitterMessageHandlerTemplate =
    `{{timeline}}

# Knowledge
{{knowledge}}

# Task: Generate a post for the character {{agentName}}.
About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

{{recentPosts}}

{{actions}}

# Task: Generate a post in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}). Include an action, if appropriate. {{actionNames}}:
{{currentPost}}
` + messageCompletionFooter;

export const twitterShouldRespondTemplate =
    `# INSTRUCTIONS: Determine if {{agentName}} (@{{twitterUserName}}) should respond to the message and participate in the conversation. Do not comment. Just respond with "true" or "false".

Response options are RESPOND, IGNORE and STOP .

{{agentName}} should respond to messages that are directed at them, or participate in conversations that are interesting or relevant to their background, IGNORE messages that are irrelevant to them, and should STOP if the conversation is concluded.

{{agentName}} is in a room with other users and wants to be conversational, but not annoying.
{{agentName}} should RESPOND to messages that are directed at them, or participate in conversations that are interesting or relevant to their background.
If a message is not interesting or relevant, {{agentName}} should IGNORE.
Unless directly RESPONDing to a user, {{agentName}} should IGNORE messages that are very short or do not contain much information.
If a user asks {{agentName}} to stop talking, {{agentName}} should STOP.
If {{agentName}} concludes a conversation and isn't part of the conversation anymore, {{agentName}} should STOP.

{{recentPosts}}

IMPORTANT: {{agentName}} (aka @{{twitterUserName}}) is particularly sensitive about being annoying, so if there is any doubt, it is better to IGNORE than to RESPOND.

{{currentPost}}

# INSTRUCTIONS: Respond with [RESPOND] if {{agentName}} should respond, or [IGNORE] if {{agentName}} should not respond to the last message and [STOP] if {{agentName}} should stop participating in the conversation.
` + shouldRespondFooter;

// Example usage class method
export class TwitterWatchClient extends ClientBase {
    private activeWatchers: Map<string, () => void> = new Map();
    client: TwitterApi;

    async onReady() {
        const handleTwitterWatchLoop = async () => {
            try {
              
                // Get tweets to watch from settings
                const tweetsToWatch = this.runtime.getSetting("TWITTER_WATCH_TWEETS")
                    .split(",")
                    .map(id => id.trim())
                    .filter(id => id.length > 0);
    
                // Get users to watch from settings
                const usersToWatch = this.runtime.getSetting("TWITTER_WATCH_USERS")
                    .split(",")
                    .map(username => username.trim())
                    .filter(username => username.length > 0);
    
                console.log(`Watching ${tweetsToWatch.length} tweets and ${usersToWatch.length} users`);
    
                // Process single tweets
                for (const tweetId of tweetsToWatch) {
                    try {
                        console.log(`Processing single tweet: ${tweetId}`);
                        await this.processSingleTweet(tweetId);
                    } catch (error) {
                        console.error(`Error processing tweet ${tweetId}:`, error);
                    }
                    // Add small delay between tweet processing
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
    
                // Handle user watchers
                // Keep track of active watchers
                if (!this.activeWatchers) {
                    this.activeWatchers = new Map();
                }
    
                // Stop watching users that are no longer in the list
                for (const [username, stopWatching] of this.activeWatchers) {
                    if (!usersToWatch.includes(username)) {
                        stopWatching();
                        this.activeWatchers.delete(username);
                        console.log(`Stopped watching user: ${username}`);
                    }
                }
    
                // Start watching new users
                for (const username of usersToWatch) {
                    if (!this.activeWatchers.has(username)) {
                        try {
                            console.log(`Starting to watch user: ${username}`);
                            const stopWatching = await this.watchUserTweets(username, 5 * 60 * 1000); // Check every 5 minutes
                            this.activeWatchers.set(username, stopWatching);
                        } catch (error) {
                            console.error(`Error setting up watcher for ${username}:`, error);
                        }
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
    
                // Schedule next check with random interval
                setTimeout(
                    handleTwitterWatchLoop,
                    (Math.floor(Math.random() * (5 - 2 + 1)) + 2) * 60 * 1000
                );
            } catch (error) {
                console.error("Error in Twitter watch loop:", error);
                // Even if there's an error, schedule next check
                setTimeout(
                    handleTwitterWatchLoop,
                    (Math.floor(Math.random() * (5 - 2 + 1)) + 2) * 60 * 1000
                );
            }
        };
        // Start the initial loop
        await handleTwitterWatchLoop();
    }
    
    constructor(runtime: IAgentRuntime) {
       
        super({
            runtime,   
        });
         this.client = new TwitterApi(this.runtime.getSetting("TWITTER_API_KEY"));
    }

    async startWatchingUser(username: string, pollIntervalMs?: number) {
        // Stop existing watcher if any
        this.stopWatchingUser(username);
        console.log(`Starting to watch user: ${username}`);
        const stopWatching = await this.watchUserTweets(username, pollIntervalMs);
        this.activeWatchers.set(username, stopWatching);
    }

    stopWatchingUser(username: string) {
        const stopWatching = this.activeWatchers.get(username);
        if (stopWatching) {
            stopWatching();
            this.activeWatchers.delete(username);
            console.log(`Stopped watching user: ${username}`);
        }
    }

    stopAllWatchers() {
        for (const [username, stopWatching] of this.activeWatchers) {
            stopWatching();
            console.log(`Stopped watching user: ${username}`);
        }
        this.activeWatchers.clear();
    }
    
    async  processSingleTweet(tweetId: string) {
        console.log(`Processing single tweet: ${tweetId}`);
        try {
            // Check if we've already processed this tweet
            const existingTweetId = stringToUuid(tweetId + "-" + this.runtime.agentId);
            const tweetExists = await this.runtime.messageManager.getMemoryById(existingTweetId);
            
            if (tweetExists) {
                console.log(`Tweet ${tweetId} has already been processed`);
                return null;
            }
    
            // Fetch the single tweet
            const tweet = await this.twitterClient.getTweet(tweetId);
            
            if (!tweet) {
                console.log(`Tweet ${tweetId} not found`);
                return null;
            }
    
            // Skip if tweet is from the bot itself
            if (tweet.username === this.runtime.getSetting("TWITTER_USERNAME")) {
                console.log("Skipping tweet from bot itself", tweetId);
                return null;
            }
    
            const conversationId = tweet.conversationId + "-" + this.runtime.agentId;
            const roomId = stringToUuid(conversationId);
            const userIdUUID = stringToUuid(tweet.userId as string);
    
            // Ensure connection
            await this.runtime.ensureConnection(
                userIdUUID,
                roomId,
                tweet.username,
                tweet.name,
                "twitter"
            );
    
            // Build conversation thread
            await buildConversationThread(tweet, this);
    
            const message = {
                content: { text: tweet.text },
                agentId: this.runtime.agentId,
                userId: userIdUUID,
                roomId,
            };
    
            // Process the tweet using existing handler
            const result = await this.handleTweet({
                tweet,
                message,
            });
    
            console.log(`Finished processing tweet ${tweetId}`);
            return result;
    
        } catch (error) {
            console.error(`Error processing tweet ${tweetId}:`, error);
            throw error;
        }
    }

    async watchUserTweets(username: string, pollIntervalMs: number = 60000) {
        console.log(`Starting to watch tweets from user: ${username}`);
        
        const userCacheFilePath = `tweetcache/last_${username.toLowerCase()}.txt`;
        let lastCheckTime: string | null = null;
    
        try {
            if (fs.existsSync(userCacheFilePath)) {
                lastCheckTime = fs.readFileSync(userCacheFilePath, 'utf-8');
                console.log(`Loaded last check time for ${username}: ${lastCheckTime}`);
            }
        } catch (error) {
            console.error(`Error loading last check time for ${username}:`, error);
        }
    
        const processInteraction = async (
            tweet: any,
            author: any,
            includes: any
        ) => {
            // Transform v2 tweet into format expected by handleTweet
            const transformedTweet: Tweet = {
                id: tweet.id,
                text: tweet.text,
                username: author.username,
                name: author.name,
                userId: author.id,
                conversationId: tweet.conversation_id,
                timestamp: new Date(tweet.created_at).getTime() / 1000,
                inReplyToStatusId: tweet.referenced_tweets?.find(ref => ref.type === 'replied_to')?.id,
                permanentUrl: `https://twitter.com/${author.username}/status/${tweet.id}`,
                
                // Required fields from interface
                hashtags: tweet.entities?.hashtags?.map(h => h.tag) || [],
                mentions: tweet.entities?.mentions?.map(m => ({
                    id: m.id,
                    username: m.username,
                    name: m.name || ''
                })) || [],
                photos: tweet.attachments?.media_keys
                    ?.filter(key => includes?.media?.find(m => m.media_key === key && m.type === 'photo'))
                    .map(key => {
                        const media = includes?.media?.find(m => m.media_key === key);
                        return {
                            url: media?.url || '',
                        };
                    }) || [],
                videos: tweet.attachments?.media_keys
                    ?.filter(key => includes?.media?.find(m => m.media_key === key && m.type === 'video'))
                    .map(key => {
                        const media = includes?.media?.find(m => m.media_key === key);
                        return {
                            url: media?.url || '',
                            preview: media?.preview_image_url || '',
                        };
                    }) || [],
                urls: tweet.entities?.urls?.map(u => u.expanded_url) || [],
                thread: [], // Initialize empty thread array
                
                // Optional fields
                isReply: !!tweet.referenced_tweets?.some(ref => ref.type === 'replied_to'),
                isRetweet: !!tweet.referenced_tweets?.some(ref => ref.type === 'retweeted'),
                isQuoted: !!tweet.referenced_tweets?.some(ref => ref.type === 'quoted'),
                quotedStatusId: tweet.referenced_tweets?.find(ref => ref.type === 'quoted')?.id,
                retweetedStatusId: tweet.referenced_tweets?.find(ref => ref.type === 'retweeted')?.id,
                likes: tweet.public_metrics?.like_count,
                retweets: tweet.public_metrics?.retweet_count,
                replies: tweet.public_metrics?.reply_count,
                views: tweet.public_metrics?.impression_count,
                timeParsed: new Date(tweet.created_at),
                sensitiveContent: tweet.possibly_sensitive || false
            };
    
            const message = {
                content: { text: tweet.text },
                agentId: this.runtime.agentId,
                userId: stringToUuid(author.id),
                roomId: stringToUuid(tweet.conversation_id + "-" + this.runtime.agentId),
            };
    
            // Process using handleTweet
            await this.handleTweet({
                tweet: transformedTweet,
                message
            });
        };
    
        const checkNewTweets = async () => {
            try {
                console.log(`Checking new tweets from ${username}`);
                
                const user = await this.client.v2.userByUsername(username);
                if (!user.data) {
                    throw new Error('User not found');
                }
    
                const params: any = {
                    'tweet.fields': [
                        'created_at',
                        'public_metrics',
                        'referenced_tweets',
                        'in_reply_to_user_id',
                        'conversation_id',
                        'entities',
                        'attachments',
                        'possibly_sensitive'
                    ],
                    'user.fields': ['username', 'name', 'profile_image_url'],
                    'media.fields': ['url', 'preview_image_url', 'type', 'media_key'],
                    expansions: [
                        'author_id',
                        'referenced_tweets.id',
                        'in_reply_to_user_id',
                        'entities.mentions.username',
                        'attachments.media_keys'
                    ],
                    exclude: ['retweets', 'replies'],
                    max_results: 10
                };
    
                if (lastCheckTime) {
                    try {
                        const date = new Date(lastCheckTime);
                        if (!isNaN(date.getTime())) {
                            params.start_time = date.toISOString();
                        }
                    } catch (error) {
                        console.warn(`Invalid last check time for ${username}, ignoring: ${lastCheckTime}`);
                    }
                }
    
                const tweets = await this.client.v2.userTimeline(user.data.id, params);
    
                if (!tweets.data?.data || tweets.data.data.length === 0) {
                    console.log(`No new tweets found for ${username}`);
                    return lastCheckTime;
                }
    
                for (const tweet of tweets.data.data) {
                    const author = tweets.includes?.users?.find(u => u.id === tweet.author_id);
                    
                    if (!author) {
                        console.log(`Could not find author data for tweet ${tweet.id}, skipping`);
                        continue;
                    }
    
                    try {
                        await processInteraction(tweet, author, tweets.includes);
                    } catch (error) {
                        console.error(`Error processing tweet ${tweet.id}:`, error);
                    }
    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
    
                if (tweets.data.data.length > 0) {
                    const newLastCheckTime = new Date(tweets.data.data[0].created_at).toISOString();
                    lastCheckTime = newLastCheckTime;
                    if (!fs.existsSync('tweetcache')) {
                        fs.mkdirSync('tweetcache', { recursive: true });
                    }
                    fs.writeFileSync(userCacheFilePath, newLastCheckTime, 'utf-8');
                    return newLastCheckTime;
                }
    
                return lastCheckTime;
    
            } catch (error) {
                console.error(`Error checking tweets for ${username}:`, error);
                if (error.data) {
                    console.error('API Error details:', error.data);
                }
                throw error;
            }
        };
    
        if (!fs.existsSync('tweetcache')) {
            fs.mkdirSync('tweetcache', { recursive: true });
        }
    
        await checkNewTweets();
    
        const intervalId = setInterval(checkNewTweets, pollIntervalMs);
    
        return () => {
            console.log(`Stopping tweet watch for ${username}`);
            clearInterval(intervalId);
        };
    }
    
    private async handleTweet({
        tweet,
        message,
    }: {
        tweet: Tweet;
        message: Memory;
    }) {
        if (tweet.username === this.runtime.getSetting("TWITTER_USERNAME")) {
            // console.log("skipping tweet from bot itself", tweet.id);
            // Skip processing if the tweet is from the bot itself
            return;
        }

        if (!message.content.text) {
            console.log("skipping tweet with no text", tweet.id);
            return { text: "", action: "IGNORE" };
        }
        console.log("handling tweet", tweet.id);
        const formatTweet = (tweet: Tweet) => {
            return `  ID: ${tweet.id}
  From: ${tweet.name} (@${tweet.username})
  Text: ${tweet.text}`;
        };
        const currentPost = formatTweet(tweet);

        let homeTimeline = [];
        // read the file if it exists
        if (fs.existsSync("tweetcache/home_timeline.json")) {
            homeTimeline = JSON.parse(
                fs.readFileSync("tweetcache/home_timeline.json", "utf-8")
            );
        } else {
            homeTimeline = await this.fetchHomeTimeline(50);
            fs.writeFileSync(
                "tweetcache/home_timeline.json",
                JSON.stringify(homeTimeline, null, 2)
            );
        }

        const formattedHomeTimeline =
            `# ${this.runtime.character.name}'s Home Timeline\n\n` +
            homeTimeline
                .map((tweet) => {
                    return `ID: ${tweet.id}\nFrom: ${tweet.name} (@${tweet.username})${tweet.inReplyToStatusId ? ` In reply to: ${tweet.inReplyToStatusId}` : ""}\nText: ${tweet.text}\n---\n`;
                })
                .join("\n");

        let state = await this.runtime.composeState(message, {
            twitterClient: this.twitterClient,
            twitterUserName: this.runtime.getSetting("TWITTER_USERNAME"),
            currentPost,
            timeline: formattedHomeTimeline,
        });

        // check if the tweet exists, save if it doesn't
        const tweetId = stringToUuid(tweet.id + "-" + this.runtime.agentId);
        const tweetExists =
            await this.runtime.messageManager.getMemoryById(tweetId);

        if (!tweetExists) {
            console.log("tweet does not exist, saving");
            const userIdUUID = stringToUuid(tweet.userId as string);
            const roomId = stringToUuid(tweet.conversationId);

            const message = {
                id: tweetId,
                agentId: this.runtime.agentId,
                content: {
                    text: tweet.text,
                    url: tweet.permanentUrl,
                    inReplyTo: tweet.inReplyToStatusId
                        ? stringToUuid(
                              tweet.inReplyToStatusId +
                                  "-" +
                                  this.runtime.agentId
                          )
                        : undefined,
                },
                userId: userIdUUID,
                roomId,
                createdAt: tweet.timestamp * 1000,
            };
            this.saveRequestMessage(message, state);
        }

        console.log("composeState done");

        const shouldRespondContext = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.twitterShouldRespondTemplate ||
                this.runtime.character?.templates?.shouldRespondTemplate ||
                twitterShouldRespondTemplate,
        });

        const shouldRespond = await generateShouldRespond({
            runtime: this.runtime,
            context: shouldRespondContext,
            modelClass: ModelClass.SMALL,
        });

        if (!shouldRespond) {
            console.log("Not responding to message");
            return { text: "", action: "IGNORE" };
        }

        const context = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.twitterMessageHandlerTemplate ||
                this.runtime.character?.templates?.messageHandlerTemplate ||
                twitterMessageHandlerTemplate,
        });

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.SMALL,
        });

        const stringId = stringToUuid(tweet.id + "-" + this.runtime.agentId);

        response.inReplyTo = stringId;

        if (response.text) {
            try {
                const callback: HandlerCallback = async (response: Content) => {
                    const memories = await sendTweet(
                        this,
                        response,
                        message.roomId,
                        this.runtime.getSetting("TWITTER_USERNAME"),
                        tweet.id
                    );
                    return memories;
                };

                const responseMessages = await callback(response);

                state = (await this.runtime.updateRecentMessageState(
                    state
                )) as State;

                for (const responseMessage of responseMessages) {
                    if (
                        responseMessage ===
                        responseMessages[responseMessages.length - 1]
                    ) {
                        responseMessage.content.action = response.action;
                    } else {
                        responseMessage.content.action = "CONTINUE";
                    }
                    await this.runtime.messageManager.createMemory(
                        responseMessage
                    );
                }

                await this.runtime.evaluate(message, state);

                await this.runtime.processActions(
                    message,
                    responseMessages,
                    state
                );
                const responseInfo = `Context:\n\n${context}\n\nSelected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}\nAgent's Output:\n${response.text}`;
                // f tweets folder dont exist, create
                if (!fs.existsSync("tweets")) {
                    fs.mkdirSync("tweets");
                }
                const debugFileName = `tweets/tweet_generation_${tweet.id}.txt`;
                fs.writeFileSync(debugFileName, responseInfo);
                await wait();
            } catch (error) {
                console.error(`Error sending response tweet: ${error}`);
            }
        }
    }
}