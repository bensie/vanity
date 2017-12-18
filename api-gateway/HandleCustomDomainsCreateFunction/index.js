const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const stepfunctions = new AWS.StepFunctions()

const payloadObjectWithData = data => ({
  domain_name: data.DomainName.S,
  origin_domain_name: data.OriginDomainName ? data.OriginDomainName.S : null,
  setup_started_at: data.OriginDomainName ? data.SetupStartedAt.N : null,
  setup_verified_at: data.SetupVerifiedAt ? data.SetupVerifiedAt.N : null,
  setup_verification_failed_at: data.SetupVerificationFailedAt
    ? data.SetupVerificationFailedAt
    : null,
  delete_started_at: data.DeleteStartedAt ? data.DeleteStartedAt.N : null,
  nameservers: data.Nameservers ? data.Nameservers.SS : null,
  route53_hosted_zone_created_at: data.Route53HostedZoneCreatedAt
    ? data.Route53HostedZoneCreatedAt.N
    : null,
  route53_hosted_zone_id: data.Route53HostedZoneID
    ? data.Route53HostedZoneID.S
    : null,
  nameserver_delegation_verified_at: data.NameserverDelegationVerifiedAt
    ? data.NameserverDelegationVerifiedAt.N
    : null,
  ses_domain_identity_created_at: data.SESDomainIdentityCreatedAt
    ? data.SESDomainIdentityCreatedAt.N
    : null,
  ses_domain_identity_verified_at: data.SESDomainIdentityVerifiedAt
    ? data.SESDomainIdentityVerifiedAt.N
    : null,
  ses_domain_dkim_verified_at: data.SESDomainDKIMVerifiedAt
    ? data.SESDomainDKIMVerifiedAt.N
    : null,
  acm_certificate_arn: data.ACMCertificateArn ? data.ACMCertificateArn.S : null,
  acm_certificate_verified_at: data.ACMCertificateVerifiedAt
    ? data.ACMCertificateVerifiedAt.N
    : null,
  cloudfront_distribution_id: data.CloudFrontDistributionID
    ? data.CloudFrontDistributionID.S
    : null,
  cloudfront_distribution_domain_name: data.CloudFrontDistributionDomainName
    ? data.CloudFrontDistributionDomainName.S
    : null,
  cloudfront_distribution_verified_at: data.CloudFrontDistributionVerifiedAt
    ? data.CloudFrontDistributionVerifiedAt.N
    : null
})

exports.handler = (event, context, callback) => {
  const body = JSON.parse(event.body)
  const domainName = event.pathParameters.domain_name.toLowerCase()
  const originDomainName = body.origin_domain_name.toLowerCase()
  const regex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/g

  console.log(`Handling create for ${domainName} => ${originDomainName}`)

  if (!domainName.match(regex)) {
    const response = {
      statusCode: 400,
      body: JSON.stringify({ message: 'domain_name is invalid' })
    }
    callback(null, response)
    return
  }

  if (!originDomainName.match(regex)) {
    const response = {
      statusCode: 400,
      body: JSON.stringify({ message: 'origin_domain_name is invalid' })
    }
    callback(null, response)
    return
  }

  const setupStartedAt = Date.now()
  const putItemParams = {
    TableName: process.env.DYNAMODB_TABLE,
    Item: {
      DomainName: {
        S: domainName
      },
      SetupStartedAt: {
        N: `${setupStartedAt}`
      },
      OriginDomainName: {
        S: originDomainName
      }
    },
    ConditionExpression: 'DomainName <> :d',
    ExpressionAttributeValues: {
      ':d': {
        S: domainName
      }
    }
  }

  dynamodb.putItem(putItemParams, function(err, data) {
    if (err) {
      console.log(err, err.stack)
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: 'domain_name already exists' })
      }
      callback(null, response)
    } else {
      const params = {
        stateMachineArn: process.env.STATE_MACHINE_ARN,
        input: JSON.stringify({ domainName })
      }
      stepfunctions.startExecution(params, (err, data) => {
        if (err) {
          console.log(err, err.stack)
          const response = {
            statusCode: 400,
            body: JSON.stringify({
              message: 'failed to start step function execution'
            })
          }
          callback(null, response)
        } else {
          const initialResponsePayload = {
            DomainName: {
              S: domainName
            },
            SetupStartedAt: {
              N: setupStartedAt
            },
            OriginDomainName: {
              S: originDomainName
            }
          }
          const response = {
            statusCode: 201,
            body: JSON.stringify(payloadObjectWithData(initialResponsePayload))
          }
          callback(null, response)
        }
      })
    }
  })
}
