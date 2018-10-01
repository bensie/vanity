const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const sns = new AWS.SNS()

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
  cloudfront_distribution_authenticity_header_name: data.CloudFrontDistributionAuthenticityHeaderName
    ? data.CloudFrontDistributionAuthenticityHeaderName.S
    : null,
  cloudfront_distribution_authenticity_header_value: data.CloudFrontDistributionAuthenticityHeaderValue
    ? data.CloudFrontDistributionAuthenticityHeaderValue.S
    : null,
  cloudfront_distribution_verified_at: data.CloudFrontDistributionVerifiedAt
    ? data.CloudFrontDistributionVerifiedAt.N
    : null
})

exports.handler = (event, context, callback) => {
  event.Records.forEach(record => {
    if (record.eventName == 'INSERT' || record.eventName == 'MODIFY') {
      const params = {
        Message: JSON.stringify(
          payloadObjectWithData(record.dynamodb.NewImage)
        ),
        TopicArn: process.env.DYNAMODB_STREAM_SNS_TOPIC
      }
      sns.publish(params, function(err, data) {
        if (err) {
          console.error(
            'Unable to send message. Error JSON:',
            JSON.stringify(err, null, 2)
          )
        } else {
          console.log(
            'Results from sending message: ',
            JSON.stringify(data, null, 2)
          )
        }
      })
    }
  })
  callback(null, `Successfully processed ${event.Records.length} records.`)
}
