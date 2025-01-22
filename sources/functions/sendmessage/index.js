import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

const client = new DynamoDB({});
const ddb = DynamoDBDocument.from(client);

const messageTable = process.env.messageTable;
const userTable = process.env.userTable;
const isActiveUserIndex = process.env.isActiveUserIndex;

export const handler = async (event, context) => {
  var connections;
  var currentUser;

  const currentConnectionId = event.requestContext.connectionId;

  try {
    let result = await ddb.get({
      TableName: userTable,
      Key: {
        connectionId: currentConnectionId,
      }
    })
    currentUser = result.Item;
    console.log(`Got user. ${currentUser}`)

    connections = await ddb.query({ 
      TableName: userTable, 
      IndexName: isActiveUserIndex,
      KeyConditionExpression: "isActive = :isActive",
      ExpressionAttributeValues: {
        ':isActive': 1
      }
    });
    console.log(`Got users. ${connections}`)
  } catch (err) {
    console.error(err)
    return {
      statusCode: 500,
    };
  }

  const apiClient = new ApiGatewayManagementApiClient({
    apiVersion: "2018-11-29",
    endpoint: `https://${event.requestContext.domainName}`,
  });

  const message = JSON.parse(event.body).message;
  const data = {
    messageId: crypto.randomUUID(),
    username: currentUser.username,
    messageType: 'message',
    message: message,
    createdAt: new Date().getTime(),
  }

  const sendMessages = connections.Items.map(async ({ connectionId }) => {
    try {
      const postCommand = new PostToConnectionCommand({
        ConnectionId: connectionId, 
        Data: JSON.stringify(data),
      });
      await apiClient.send(postCommand);
    } catch (e) {
      console.log(e);
    }
  });

  try {
    await ddb
      .put({
        TableName: messageTable,
        Item: {
          isDeleted: 0,
          createdAtConnectionId: data.createdAt + '#' + currentConnectionId,
          ...data,
        },
      });
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
    };
  }

  try {
    await Promise.all(sendMessages);
  } catch (e) {
    console.log(e);
    return {
      statusCode: 500,
    };
  }

  return { statusCode: 200 };
};
