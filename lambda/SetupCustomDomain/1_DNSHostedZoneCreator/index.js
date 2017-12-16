const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const route53 = new AWS.Route53()

class SkipToEndWithSuccessError extends Error {}

const getItemParams = domainName => {
  return new Promise(resolve => {
    const params = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        DomainName: {
          S: domainName
        }
      }
    }
    resolve(params)
  })
}

const getItem = itemParams => {
  return new Promise((resolve, reject) => {
    dynamodb.getItem(itemParams, (err, data) => {
      if (err) {
        reject(err)
      } else if (Object.keys(data).length === 0) {
        reject(new Error('domain_name not found'))
      } else {
        resolve(data.Item)
      }
    })
  })
}

const getCreateZoneParams = item => {
  return new Promise(resolve => {
    const params = {
      Name: item.DomainName.S,
      CallerReference: `${item.DomainName.S}${item.SetupStartedAt.N}`,
      DelegationSetId: process.env.DELEGATION_SET_ID
    }
    resolve({ item, params })
  })
}

const createZone = ({ item, createZoneParams }) => {
  return new Promise((resolve, reject) => {
    if (item.Route53HostedZoneID) {
      reject(
        new SkipToEndNonError('Route53 hosted zone already exists, continuing')
      )
      return
    }
    route53.createHostedZone(createZoneParams, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

const getUpdateItemParams = hostedZone => {
  return new Promise(resolve => {
    const params = {
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
          SS: hostedZone.DelegationSet.NameServers
        },
        ':Route53HostedZoneID': {
          S: hostedZone.HostedZone.Id
        }
      }
    }
    resolve(params)
  })
}

const updateItem = updateItemParams => {
  return new Promise((resolve, reject) => {
    dynamodb.updateItem(updateItemParams, (err, _data) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

exports.handler = (event, _context, callback) => {
  const { domainName } = event
  const success = () => callback(null, { domainName })
  const failure = err => callback(err)

  getItemParams(domainName)
    .then(getItem)
    .then(getCreateZoneParams)
    .then(createZone)
    .then(updateItem)
    .then(() => success())
    .catch(error => {
      if (error instanceof SkipToEndWithSuccessError) {
        success()
      } else {
        failure(error)
      }
    })
}
