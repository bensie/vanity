const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const route53 = new AWS.Route53()
const ses = new AWS.SES()

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
      if (Object.keys(data).length === 0) {
        callback(new Error('domain_name not found'))
        return
      } else {
        const item = data.Item
        if (item.SESDomainIdentityCreatedAt) {
          callback(null, 'SES domain identity already exists, continuing')
          return
        }

        const verifyDomainIdentityParams = {
          Domain: item.DomainName.S
        }
        const verify = ses.verifyDomainIdentity(
          verifyDomainIdentityParams,
          (err, data) => {
            if (err) {
              callback(err)
              return
            } else {
              const recordSetChanges = {
                ChangeBatch: {
                  Changes: [
                    {
                      Action: 'UPSERT',
                      ResourceRecordSet: {
                        Name: `_amazonses.${domainName}`,
                        ResourceRecords: [
                          {
                            Value: `"${verify.VertificationToken}"`
                          }
                        ],
                        TTL: 3600,
                        Type: 'TXT'
                      }
                    }
                  ],
                  Comment: 'SES domain identity record'
                },
                HostedZoneId: item.Route53HostedZoneID.S
              }
              route53.changeResourceRecordSets(
                recordSetChanges,
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
                        'SET SESDomainIdentityCreatedAt=:SESDomainIdentityCreatedAt',
                      ExpressionAttributeValues: {
                        ':SESDomainIdentityCreatedAt': {
                          N: `${Date.now()}`
                        }
                      }
                    }
                    dynamodb.updateItem(updateItemParams, (err, data) => {
                      if (err) {
                        callback(err)
                        return
                      } else {
                        callback(null, 'Success from SESDomainCreator')
                        return
                      }
                    })
                  }
                }
              )
            }
          }
        )
      }
    }
  })
}
