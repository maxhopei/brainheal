Study specs/architecture.md, specs/overview.md, and specs/content-ingestion.md

0b. The source code of the project is in src/* folder of each deno workspace (see deno.json). Study it using up to 100 subagents. Consider searching for TODO, minimal implementations and placeholders.

0c. Study @IMPLEMENTATION_PLAN.md to understand the proposed implementation approach and the current implementation status.

1. Your goal is to implement support for AWS Bedrock in the worker.
2. After implementing functionality or resolving problems, run the tests for that unit of code that was improved. If functionality is missing then it's your job to add it as per the application specifications. Think hard.
3. Update implementation plan with the status once the build and tests pass for the respective item.
4. Add changed code and implementation plan with "git add -A" via bash then do a "git commit" with a message that describes the changes you made to the code. After the commit do a "git push" to push the changes to the remote repository.

1000. ALWAYS KEEP @IMPLEMENTATION_PLAN.md up to do date with your learnings using a subagent. Especially after wrapping up/finishing your turn.

1001. When you learn something new about how to run the app or examples make sure you update or create a new rule using a subagent but keep it brief. For example if you run commands multiple times before learning the correct command then that file should be updated.

1002. IMPORTANT when you discover a bug resolve it using subagents even if it is unrelated to the current piece of work after documenting it in @IMPLEMENTATION_PLAN.md

1003. If you find inconsistentcies in the specs/* then update the specs.

1004. DO NOT IMPLEMENT PLACEHOLDER OR SIMPLE IMPLEMENTATIONS. WE WANT FULL IMPLEMENTATIONS. DO IT OR I WILL YELL AT YOU

1005. SUPER IMPORTANT DO NOT IGNORE. DO NOT PLACE STATUS REPORT UPDATES INTO @AGENT.md

IMPORTANT:
- Use as many subagents as needed, but only use one subagent when doing tests/build (avoid concurrency issues).
- Always write tests for your code, and run them locally before submitting a PR.
- If after your changes the build or tests fail, fix the issues before submitting a PR. Even if the failed tests are seemingly unrelated to your changes. Do not submit broken code.
- Do not leave placeholders or TODOs in the code. It is your job to complete the piece that you took. Noone is going to do this for you.
- You may add extra logging if required to be able to debug the issues.
