const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const dns = require('dns')
const parseDomain = require('parse-domain')

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

const fetchDomainRootNameservers = item => {
  return new Promise((resolve, reject) => {
    const domainInfo = parseDomain(item.DomainName.S)
    const registeredDomain = `${domainInfo.domain}.${domainInfo.tld}`

    dns.setServers(['8.8.8.8', '8.8.4.4'])
    dns.resolveNs(registeredDomain, (err, addresses) => {
      if (err) {
        reject(err)
      } else {
        resolve({ item, addresses })
      }
    })
  })
}

const fetchTargetDomainNameservers = ({ item, domainRootNameservers }) => {
  return new Promise((resolve, reject) => {
    dns.setServers([domainRootNameservers[0]])
    dns.resolveNs(domainName, (err, addresses) => {
      if (err) {
        reject(err)
      } else {
        resolve({ item, addresses })
      }
    })
  })
}

const verifyExpectedNameserversMatch = ({ item, targetDomainNameservers }) => {
  return new Promise((resolve, reject) => {
    let expectedNameservers
    if (process.env.EXPECTED_NAMESERVERS !== '') {
      expectedNameservers = process.env.EXPECTED_NAMESERVERS.split(',')
    } else {
      expectedNameservers = item.NameServers.SS
    }
    expectedNameservers.sort()
    targetDomainNameservers.sort()

    if (expectedNameservers === targetDomainNameservers) {
      resolve({ item })
    } else {
      reject(
        new Error(
          `Target nameservers (${targetDomainNameservers}) do not match expected (${expectedNameservers})`
        )
      )
    }
  })
}

const updateItemParams = ({ item }) => {
  return new Promise(resolve => {
    const params = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        DomainName: {
          S: item.DomainName.S
        }
      },
      UpdateExpression:
        'SET NameserverDelegationVerifiedAt=:NameserverDelegationVerifiedAt',
      ExpressionAttributeValues: {
        ':NameserverDelegationVerifiedAt': {
          N: `${Date.now()}`
        }
      }
    }
    resolve({ item, params })
  })
}

const updateItem = ({ item, updateItemParams }) => {
  return new Promise((resolve, reject) => {
    dynamodb.updateItem(updateItemParams, (err, data) => {
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
    .then(fetchDomainRootNameservers)
    .then(fetchTargetDomainNameservers)
    .then(verifyExpectedNameserversMatch)
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
