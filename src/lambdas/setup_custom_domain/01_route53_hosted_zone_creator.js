const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const route53 = new AWS.Route53()

class SkipToEndWithSuccessError extends Error {}

const idempotencyToken = (setupStartedAt, domainName) => {
  return `${setupStartedAt}${domainName}`.replace(/\W+/g, '').substring(0, 32)
}

const getItem = domainName => {
  return new Promise((resolve, reject) => {
    const params = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        DomainName: {
          S: domainName
        }
      }
    }
    dynamodb.getItem(params, (err, data) => {
      if (err) {
        reject(err)
      } else if (Object.keys(data).length === 0) {
        reject(new Error('domain_name not found'))
      } else {
        resolve({ item: data.Item })
      }
    })
  })
}

const getCreateZoneParams = ({ item }) => {
  return new Promise(resolve => {
    const rds = process.env.REUSABLE_DELEGATION_SET_ID
    const delegationSetId = !rds || 0 === rds.length ? null : rds
    const createZoneParams = {
      Name: item.DomainName.S,
      CallerReference: idempotencyToken(
        item.SetupStartedAt.N,
        item.DomainName.S
      ),
      DelegationSetId: delegationSetId
    }
    resolve({ item, createZoneParams })
  })
}

const createZone = ({ item, createZoneParams }) => {
  return new Promise((resolve, reject) => {
    if (item.Route53HostedZoneID) {
      reject(
        new SkipToEndWithSuccessError(
          'Route53 hosted zone already exists, continuing'
        )
      )
      return
    }
    route53.createHostedZone(createZoneParams, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve({ item, hostedZone: data })
      }
    })
  })
}

const getUpdateItemParams = ({ item, hostedZone }) => {
  return new Promise(resolve => {
    const en = process.env.EXPECTED_NAMESERVERS
    const nameservers =
      !en || 0 === en.length
        ? hostedZone.DelegationSet.NameServers
        : en.split(',')
    const updateItemParams = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        DomainName: {
          S: item.DomainName.S
        }
      },
      UpdateExpression:
        'SET Route53HostedZoneCreatedAt=:Route53HostedZoneCreatedAt, Nameservers=:Nameservers, Route53HostedZoneID=:Route53HostedZoneID',
      ExpressionAttributeValues: {
        ':Route53HostedZoneCreatedAt': {
          N: `${Date.now()}`
        },
        ':Nameservers': {
          SS: nameservers
        },
        ':Route53HostedZoneID': {
          S: hostedZone.HostedZone.Id
        }
      }
    }
    resolve({ item, updateItemParams })
  })
}

const updateItem = ({ updateItemParams }) => {
  return new Promise((resolve, reject) => {
    dynamodb.updateItem(updateItemParams, err => {
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
  const failure = err => {
    const serializedError = JSON.stringify({
      message: err.message,
      domainName
    })
    callback(new Error(serializedError))
  }

  getItem(domainName)
    .then(getCreateZoneParams)
    .then(createZone)
    .then(getUpdateItemParams)
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
