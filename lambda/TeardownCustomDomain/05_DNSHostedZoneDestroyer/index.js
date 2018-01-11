const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const route53 = new AWS.Route53()

class SkipToEndWithSuccessError extends Error {}

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
        if (data.item.Route53HostedZoneID) {
          resolve({ item: data.Item })
        } else {
          reject(new SkipToEndWithSuccessError('no route53 zone configured'))
        }
      }
    })
  })
}

const listResourceRecordSets = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      HostedZoneId: item.Route53HostedZoneID.S
    }
    route53.listResourceRecordSets(params, (err, data) => {
      if (err) {
        if (err.code === 'NoSuchHostedZone') {
          resolve({ item, resourceRecordSets: { ResourceRecordSets: [] } })
        } else {
          reject(err)
        }
      } else {
        resolve({ item, resourceRecordSets: data })
      }
    })
  })
}

const deleteResourceRecordSets = ({ item, resourceRecordSets }) => {
  return new Promise((resolve, reject) => {
    let changes = []
    resourceRecordSets.ResourceRecordSets.forEach(rrs => {
      if (rrs.Type === 'SOA' || rrs.Type === 'NS') {
        return
      }

      // Route53 is stupid and the output of listResourceRecordSets is not
      // valid input for ALIAS records because it sends an empty ResourceRecords
      // array.
      if (rrs.AliasTarget) {
        delete rrs.ResourceRecords
      }

      changes.push({
        Action: 'DELETE',
        ResourceRecordSet: rrs
      })
    })

    const params = {
      ChangeBatch: {
        Changes: changes
      },
      HostedZoneId: item.Route53HostedZoneID.S
    }

    route53.changeResourceRecordSets(params, (err, data) => {
      if (err) {
        if (err.code === 'NoSuchHostedZone') {
          resolve({ item })
        } else {
          reject(err)
        }
      } else {
        resolve({ item })
      }
    })
  })
}

const deleteHostedZone = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      Id: item.Route53HostedZoneID.S
    }

    route53.deleteHostedZone(params, (err, _data) => {
      if (err) {
        if (err.code === 'NoSuchHostedZone') {
          resolve({ item })
        } else {
          reject(err)
        }
      } else {
        resolve({ item })
      }
    })
  })
}

const getUpdateItemParams = ({ item }) => {
  return new Promise(resolve => {
    const updateItemParams = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        DomainName: {
          S: item.DomainName.S
        }
      },
      UpdateExpression:
        'REMOVE Route53HostedZoneID, Route53HostedZoneCreatedAt, Nameservers, NameserverDelegationVerifiedAt'
    }
    resolve({ item, updateItemParams })
  })
}

const updateItem = ({ item, updateItemParams }) => {
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
  const failure = err => {
    err.domainName = domainName
    callback(err)
  }

  getItem(domainName)
    .then(listResourceRecordSets)
    .then(deleteResourceRecordSets)
    .then(deleteHostedZone)
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
