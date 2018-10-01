const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const acm = new AWS.ACM()

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

const createCertificate = ({ item }) => {
  return new Promise((resolve, reject) => {
    if (item.ACMCertificateArn) {
      reject(
        new SkipToEndWithSuccessError(
          'ACM certificate already exists, continuing'
        )
      )
      return
    }

    const params = {
      DomainName: item.DomainName.S,
      SubjectAlternativeNames: [`*.${item.DomainName.S}`],
      IdempotencyToken: idempotencyToken(
        item.SetupStartedAt.N,
        item.DomainName.S
      ),
      ValidationMethod: 'DNS'
    }
    acm.requestCertificate(params, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve({ item, arn: data.CertificateArn })
      }
    })
  })
}

const getUpdateItemParams = ({ item, arn }) => {
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
          S: arn
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
