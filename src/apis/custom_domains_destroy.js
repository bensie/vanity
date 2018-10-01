const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const stepfunctions = new AWS.StepFunctions()

exports.handler = (event, context, callback) => {
  const domainName = event.pathParameters.domain_name.toLowerCase()

  const getItemParams = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      DomainName: {
        S: domainName
      }
    }
  }

  dynamodb.getItem(getItemParams, function(err, data) {
    if (err) {
      console.log(err, err.stack)
      const response = {
        statusCode: 500,
        body: JSON.stringify({ message: 'there was an error in DynamoDB' })
      }
      callback(null, response)
    } else {
      if (Object.keys(data).length === 0) {
        const response = {
          statusCode: 404,
          body: JSON.stringify({ message: 'domain_name not found' })
        }
        callback(null, response)
      } else if (data.Item.DeleteStartedAt) {
        const response = {
          statusCode: 400,
          body: JSON.stringify({
            message: 'Delete operation is already in progress'
          })
        }
        callback(null, response)
      } else {
        const deleteStartedAt = Date.now()
        const updateItemParams = {
          TableName: process.env.DYNAMODB_TABLE,
          Key: {
            DomainName: {
              S: data.Item.DomainName.S
            }
          },
          UpdateExpression: 'SET DeleteStartedAt=:DeleteStartedAt',
          ExpressionAttributeValues: {
            ':DeleteStartedAt': {
              N: `${deleteStartedAt}`
            }
          }
        }
        dynamodb.updateItem(updateItemParams, err => {
          if (err) {
            console.log(err, err.stack)
            const response = {
              statusCode: 500,
              body: JSON.stringify({
                message: 'there was an error in DynamoDB'
              })
            }
            callback(null, response)
          } else {
            const params = {
              stateMachineArn: process.env.STATE_MACHINE_ARN,
              input: JSON.stringify({ domainName })
            }
            stepfunctions.startExecution(params, err => {
              if (err) {
                console.log(err, err.stack)
                const response = {
                  statusCode: 400,
                  body: JSON.stringify({
                    message: 'failed to start step function execution'
                  })
                }
                callback(null, response)
              } else {
                const response = {
                  statusCode: 204,
                  body: ''
                }
                callback(null, response)
              }
            })
          }
        })
      }
    }
  })
}
