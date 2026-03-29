# Brain-heal Specification

The app helps me read stuff that I want on the internet in a short instagram-like format.
Its secondary goal is to replace doom-scrolling with useful content.
The main difference is that I choose content by myself.

## Motivation

I follow newsletters, read articles, books, get recommendation from colleagues. Often, I find something interesting but
don’t have time, energy, or mood to read it right away. I bookmark it. And never return to it. Bookmarks accumulate,
getting back to them feels overwhelming. This builds anxiety and FOMO.

## Idea

Once I stumble upon an interesting article, I send it to the app. I can also send a short free text, i.e., "Ralph Loop".
The app fetches the article and/or searches additional information about the subject.
Then it summarizes the information in the form of short "cards". These cards form an instagram-like feed.
When I have time, I open the app and read those cards.

## Concepts

### Accounts

Prio: critical.

In the app, I have an account. I can log in with my email and password, or use a third-party provider (Google, Apple,
etc.).
The account holds my feed, preferences, and history across devices.

I can register with email and password, or use a third-party provider (Google, Apple, etc.).
The registration process is simple and quick. I can also log in with my existing account on any device.

### Posts and cards

Prio: critical.

Typically, a single article results in one post. However, if the article is long and contains multiple ideas, it can be
split into multiple posts. A post consists of one or more cards. The first card should contain the main idea of the
article. The following cards can contain supporting details, elaborate on the topics, provide examples, or related
information. Each card should be concise and easy to read.

Images from the articles can be used in the cards together with the text or as separate cards.
Videos can also be embedded as cards.

Visually, posts slide vertically, while cards within a post slide horizontally. This way, I can quickly scroll through
the main ideas of different articles and dive deeper into the ones that interest me.

### Feed

Prio: critical.

The feed is the main screen of the app. It shows all the posts in chronological order (the oldest ones first).
The feed is fixed and deterministic. It doesn't randomize every time I open it (unlike in instagram).

I want to explicitly control the "read" state. When I swipe the last card in the post left, the post is marked as "
read".

When I swipe it right, the post goes to the bottom of the feed. This means I want to return to it later.

### Favorites

Prio: medium.

I can save the post to Favorites. I can organize favorites in groups (one level). By default, posts are saved to the "
Saved" group.

When I tap "save", it is immediately saved to the "Saved" group, but at the same screen, I can choose another group or
create a new one. This way, I can quickly save the post and organize it later. Similar to how bookmarks work in
browsers.

### Reactions

Prio: low.

I can like the post. This information is stored and can be used to suggest new posts if I'm running out of content (see
Recommendations).
I can "meh" the post. This means that I'm not interested in the topic and I don't want to see similar content in the
future. This information is also stored and used for Recommendations.

### Recommendations

Prio: low.

When I run out of content in the feed, the app suggests to discover related things. The app uses my history of posts,
likes, and meh's to suggest new content that might be interesting for me.

Crucially, the app doesn't generate suggested posts/cards right away. Instead, it proposes to explore a specific topic,
and only when I click on it, it generates a post about it. This way I have a clear understanding of whether I read my
own content, or suggested.

The suggestion must come with a reason. For example, a suggestion mini-card can look like this:

```
Have you heard of Conductor framework? 

[In grey:] Becasue you were interested in spec-driven orchestration.
```

### In-app sharing

Prio: extra-low.

I can share the post with my other users in the app. When sharing I can find the user by their nickname. The users, I've
shared with, are suggested when I want to share a new post. This way, I can easily share content with the people I'm
interested in. Shared content appears in their feed and is clearly marked as a recommendation. It states who shared it,
and shows the message that I sent together with the shared post.

### External sharing

Prio: low.

I can share the post outside the app (standard sharing options on mobile).
The shared content contains contents from the first card and a link to the web version (TBD) of the card.

### Billing

Prio: low.

Free tier allows me to use app, but limits the number of articles the app processes per day/month (TBD). No suggestions
in the free tier.

Paid tier is still reasonably rate limited, but allows convenient usage.

Details are TBD.

## Architecture

### Components

- Web version, mobile-first (critical)
- iOS Mobile app (high prio)
- Android Mobile app (low prio)
- Backend service (critical)
  - Public API (feed, likes, meh's, favorites, add-to-feed, etc.)
  - Content processing jobs (fetching articles, summarization, splitting into cards, etc.)
  - Admin API/UI or SSR app (browser only) for monitoring and managing the system (e.g., monitoring the queue, managing
    users, etc.)
- External LLM model + API (critical)
- Database (critical)
- Processing queue (critical) (can be done via database)

### Tech stack

- Web: React + TypeScript
- Mobile: React Native + TypeScript
- Backend: Deno + TypeScript
- LLM: TBD (OpenAI, Anthropic, etc.)
- Database: PostgreSQL (or similar relational database)
- Processing queue: PostgreSQL at the beginning. Abstracted out from storage in the code.
- Deployment: TBD (Vercel, AWS, etc.)
- Authentication: Firebase Auth, auth0 (or similar service) Explore pricing and ease of integration.
- Payment processing: Stripe (or similar service) Explore pricing and ease of integration.

### Data model

TBD

### Ingestion and processing flow

Ingestion refers to the process of adding new content to the app.
This can be done by the user (by sending a link or free text).

When new content is added, it goes through the following steps:
1. The input is stored in the queue for processing.
2. The queue processor picks up one input item from the queue at a regular pace and processes it. The processing
   includes:
  - Fetching the article content (via link or searching for the topic in case of free text)
  - Summarizing the content and splitting into cards using LLM
  - Storing the post and cards in the database (adding to the feed)

The processing flow must strictly monitor the costs associated with the LLM usage (i.e. tokens, API requests, etc.).
The process is rate-limited on shorter periods to be able to work withing the limits of the billing period (i.e. a
month).

Example: account has 10$ to spend on LLM per month. Unused budget accumulates. The daily limit is calculated as: [remaining monthly budget] / [remaining days in the month]. For example, if it's the 20th day of a 30-day month, and the account has spent 5$ so far, the remaining budget is 8$. The remaining days in the month are 10. Therefore, the daily limit is: 5$ / 10 days = 0.5$ per day. 
Each run counts its cost. When total costs exceed the daily limit, the processing is paused until the next day. 
User is notified in the app.