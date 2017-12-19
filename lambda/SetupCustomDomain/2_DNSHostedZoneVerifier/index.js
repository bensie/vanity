const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const dns = require('dns')
const nativedns = require('native-dns')
const parseDomain = require('parse-domain')

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
        resolve({ item: data.Item })
      }
    })
  })
}

const fetchDomainRootNameservers = ({ item }) => {
  return new Promise((resolve, reject) => {
    const domainInfo = parseDomain(item.DomainName.S)
    const registeredDomain = `${domainInfo.domain}.${domainInfo.tld}`

    const question = nativedns.Question({
      name: registeredDomain,
      type: 'NS'
    })

    const req = nativedns.Request({
      question: question,
      server: { address: '8.8.8.8', port: 53, type: 'udp' },
      timeout: 1000
    })

    req.on('timeout', function() {
      reject(new Error('Timeout making DNS lookup request'))
    })

    req.on('message', function(err, answer) {
      if (err) {
        reject(err)
      } else {
        resolve({
          item,
          domainRootNameservers: answer.answer.map(item => item.data)
        })
      }
    })

    req.send()
  })
}

const fetchRootDomainNameserverIPs = ({ item, domainRootNameservers }) => {
  return new Promise((resolve, reject) => {
    dns.setServers(['8.8.8.8', '8.8.4.4'])
    dns.resolve4(domainRootNameservers[0], (err, addresses) => {
      if (err) {
        reject(err)
      } else {
        resolve({ item, rootDomainNameserverIPs: addresses })
      }
    })
  })
}

const lookupTargetNameservers = ({ item, rootDomainNameserverIPs }) => {
  return new Promise((resolve, reject) => {
    const question = nativedns.Question({
      name: item.DomainName.S,
      type: 'NS'
    })

    const req = nativedns.Request({
      question: question,
      server: { address: rootDomainNameserverIPs[0], port: 53, type: 'udp' },
      timeout: 1000
    })

    req.on('timeout', function() {
      reject(new Error('Timeout making DNS lookup request'))
    })

    req.on('message', function(err, answer) {
      if (err) {
        reject(err)
      } else {
        resolve({
          item,
          targetDomainNameservers: answer.authority.map(item => item.data)
        })
      }
    })

    req.send()
  })
}

const verifyExpectedNameserversMatch = ({ item, targetDomainNameservers }) => {
  return new Promise((resolve, reject) => {
    let expectedNameservers
    if (process.env.EXPECTED_NAMESERVERS !== '') {
      expectedNameservers = process.env.EXPECTED_NAMESERVERS.split(',')
    } else {
      expectedNameservers = item.Nameservers.SS
    }
    expectedNameservers.sort()
    targetDomainNameservers.sort()

    if (
      expectedNameservers.length == targetDomainNameservers.length &&
      expectedNameservers.every((v, i) => v === targetDomainNameservers[i])
    ) {
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
        'SET NameserverDelegationVerifiedAt=:NameserverDelegationVerifiedAt',
      ExpressionAttributeValues: {
        ':NameserverDelegationVerifiedAt': {
          N: `${Date.now()}`
        }
      }
    }
    resolve({ item, updateItemParams })
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

  getItem(domainName)
    .then(fetchDomainRootNameservers)
    .then(fetchRootDomainNameserverIPs)
    .then(lookupTargetNameservers)
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
