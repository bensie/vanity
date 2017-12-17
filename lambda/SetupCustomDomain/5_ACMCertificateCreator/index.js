const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const acm = new AWS.ACM()

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

const createCertificate = ({ item }) => {
  return new Promise((resolve, reject) => {
    if (item.ACMCertificateArn) {
      reject(
        new SkipToEndNonError('ACM certificate already exists, continuing')
      )
      return
    }

    const params = {
      DomainName: item.DomainName.S,
      SubjectAlternativeNames: [`*.${item.DomainName.S}`],
      IdempotencyToken: `${item.DomainName.S}${item.SetupStartedAt.N}`,
      ValidationMethod: 'DNS'
    }
    acm.requestCertificate(params, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve({ item, certificate: data })
      }
    })
  })
}

const getUpdateItemParams = ({ item, certificate }) => {
  return new Promise(resolve => {
    const updateItemParams = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        DomainName: {
          S: item.DomainName.S
        }
      },
      UpdateExpression: 'SET ACMCertificateArn=:ACMCertificateArn',
      ExpressionAttributeValues: {
        ':ACMCertificateArn': {
          S: `${certificate.CertificateArn}`
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
    .then(createCertificate)
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
