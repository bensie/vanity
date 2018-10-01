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
        if (data.Item.ACMCertificateArn) {
          resolve({ item: data.Item })
        } else {
          reject(new SkipToEndWithSuccessError('no certificate configured'))
        }
      }
    })
  })
}

const deleteCertificate = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      CertificateArn: item.ACMCertificateArn.S
    }

    acm.deleteCertificate(params, err => {
      if (err) {
        if (err.code === 'ResourceNotFoundException') {
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
      UpdateExpression: 'REMOVE ACMCertificateArn, ACMCertificateVerifiedAt'
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
    .then(deleteCertificate)
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
