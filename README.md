# AWS Custom Domains

This project aims to provide repeatable infrastructure templates for a web service to point any user-owned domain or subdomain at your application.

It runs entirely and securely in your own AWS account using only services that are 100% managed by AWS. In most cases it would only cost a few pennies each month to run this service.

## Assumptions

* Your backend already provides account-level subdomains on your app's domain (user.mycoolapp.com).
* Your backend is served with HTTPS and you want custom domains to only be served over HTTPS.
* You have an AWS account. **I recommend creating a new, separate AWS account just for this service for security reasons and so you don't fill your main account with customer-specific data**. The IAM role granted to the Lambda functions has broad access to CloudFront distributions, Certificate Manager certificates, and Route 53 domains within your account.

## Dependencies

With a single click and the default settings, your copy of this service can be up and running in seconds. Know that some AWS services will incur usage costs (it's minimal though, pennies per month in most cases).

The following AWS services are used:

* API Gateway
* CloudFront
* CloudFormation
* Certificate Manager
* DynamoDB
* IAM
* Lambda
* Route 53
* S3
* SES
* Step Functions

## Installation

Click the "Launch Stack" to bootstrap everything you need in the us-east-1 (N. Virginia) region.

After creating your CloudFormation stack, the "Outputs" section of the Stack Detail contains the API Gateway base URL (called CustomDomainsAPIURL) for your custom domain service. It looks something like `https://xxxxxx.execute-api.us-east-1.amazonaws.com/v1/custom_domains`

## Usage

This service provides just 3 JSON API endpoints for management of custom domains. You can create a custom domain, fetch the status of a custom domain, and delete a custom domain.

For each action, you must supply the custom domain in the path. A `POST` request to this endpoint creates a new custom domain, a `GET` request fetches info about the existing custom domain, and a `DELETE` request removes the custom domain.

```
https://xxxx.execute-api.us-east-1.amazonaws.com/v1/custom_domains/my.customdomain.com
```

### Create a custom domain

To create a new custom domain, you must supply the `origin_domain_name` as an attribute in a JSON request body:

#### Request

```
curl -X "POST" "https://xxxx.execute-api.us-east-1.amazonaws.com/v1/custom_domains/my.customdomain.com" \
     -H 'Content-Type: application/json; charset=utf-8' \
     -d $'{
  "origin_domain_name": "usersubdomain.myapp.com"
}'
```

#### Response

```
HTTP/1.1 201 Created
Content-Type: application/json
...

{"domain_name":"my.customdomain.com","setup_started_at":1513273146072}
```

