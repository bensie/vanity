const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB({
  region: process.env.REGION
})
const route53 = new AWS.Route53()

exports.handler = (event, context, callback) => {
  const { domainName } = event

  const getItemParams = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      DomainName: {
        S: domainName
      }
    }
  }

  dynamodb.getItem(getItemParams, (err, data) => {
    if (err) {
      callback(err)
      return
    } else {
      const item = data.Item
      if (Object.keys(data).length === 0) {
        callback(new Error('domain_name not found'))
        return
      } else {
        if (item.Route53HostedZoneID) {
          callback(null, 'Route53 hosted zone already exists, continuing')
          return
        }

        const createZoneParams = {
          Name: item.DomainName.S,
          CallerReference: `${item.DomainName.S}${item.SetupStartedAt.N}`,
          DelegationSetId: process.env.DELEGATION_SET_ID
        }
        const zoneCreate = route53.createHostedZone(
          createZoneParams,
          (err, data) => {
            if (err) {
              callback(err)
              return
            } else {
              const updateItemParams = {
                TableName: process.env.DYNAMODB_TABLE,
                Key: {
                  DomainName: {
                    S: domainName
                  }
                },
                UpdateExpression:
                  'SET Route53HostedZoneCreatedAt=:Route53HostedZoneCreatedAt, Nameservers=:Nameservers, Route53HostedZoneID=:Route53HostedZoneID',
                ExpressionAttributeValues: {
                  ':Route53HostedZoneCreatedAt': {
                    N: `${Date.now()}`
                  },
                  ':Nameservers': {
                    SS: data.DelegationSet.NameServers
                  },
                  ':Route53HostedZoneID': {
                    S: data.HostedZone.Id
                  }
                }
              }
              dynamodb.updateItem(updateItemParams, (err, data) => {
                if (err) {
                  callback(err)
                  return
                } else {
                  callback(null, 'Success from Route53HostedZoneCreator')
                  return
                }
              })
            }
          }
        )
      }
    }
  })
}
