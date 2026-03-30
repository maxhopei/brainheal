# Setup AWS Access to Bedrock for the BrainHeal Worker

Here's the full walkthrough:

---

## Creating AWS Credentials for Bedrock Access

### 1. Create an IAM User (or use a Role)

Go to the **IAM console → Users → Create user**.

Give it a name (e.g. `bedrock-api-user`), and on the permissions step choose **Attach policies directly**.

---

### 2. Attach the Right Policy

AWS has a managed policy for Bedrock: **`AmazonBedrockFullAccess`** — this grants access to invoke all models. If you want a tighter, production-grade policy, use an inline policy like this:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.*"
      ]
    }
  ]
}
```

This scopes access to only Anthropic models, and only the invocation actions — nothing else (no model listing, no fine-tuning, etc.). You can tighten the `Resource` further to a specific region or model ID if needed.

---

### 3. Generate the Access Keys

After creating the user, go to **IAM → Users → your user → Security credentials → Create access key**.

When asked for use case, select **"Application running outside AWS"**. You'll get:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

**Download or copy them immediately** — the secret is only shown once.

---

### 4. Configure Them in Your Service

There are a few ways, depending on your setup:

**Environment variables (simplest, works everywhere):**
```bash
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=eu-central-1   # or us-east-1 — wherever your Bedrock quota is
```

**AWS credentials file** (`~/.aws/credentials`):
```ini
[default]
aws_access_key_id = AKIAxxxxxxxxxxxxxxxx
aws_secret_access_key = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
And `~/.aws/config`:
```ini
[default]
region = eu-central-1
```

**In code (e.g. Node.js with the AWS SDK):**
```typescript
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: "eu-central-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
```

---

### 5. One Critical Step: Enable the Models

Credentials alone aren't enough. You need to **request model access** in the Bedrock console:

**Bedrock console → Model access → Manage model access** → select the Anthropic models you need (e.g. Claude Sonnet 4.6) → Save.

This is per-region, so if you switch regions later, you'll need to repeat it there.

---

### Security Recommendations

| Practice | Why |
|---|---|
| Never commit keys to git | Rotate immediately if this happens |
| Use environment variables or secrets manager | Not hardcoded in source |
| Scope the IAM policy tightly | Least-privilege — limit to specific models/actions |
| Prefer IAM Roles over long-lived keys | If your service runs on EC2/ECS/Lambda, use a role instead — no keys needed at all |
| Set up key rotation | IAM → Security credentials → rotate periodically |

The IAM Role approach (last point) is the gold standard for production — no static credentials to leak, access is scoped to the compute resource itself. Worth considering once BrainHeal moves beyond local/hobby stage.