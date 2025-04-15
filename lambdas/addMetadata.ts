/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({});
const tableName = process.env.TABLE_NAME!;

export const handler: SQSHandler = async (event) => {
  console.log("Metadata Lambda triggered");

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body); // SQS message body
      const snsMessage = JSON.parse(body.Message);
      const attributes = body.MessageAttributes;

      const id = snsMessage.id;
      const value = snsMessage.value;
      const metadataType = attributes?.metadata_type?.Value;

      if (!id || !value || !metadataType) {
        throw new Error("Missing id, value or metadata_type in message");
      }

      const allowedFields = ["Caption", "Date", "Name"];
      if (!allowedFields.includes(metadataType)) {
        throw new Error(`Invalid metadata_type: ${metadataType}`);
      }

      const fieldName = metadataType.toLowerCase(); // caption, date, name

      const updateParams = {
        TableName: tableName,
        Key: { id: { S: id } },
        UpdateExpression: `SET #field = :val`,
        ExpressionAttributeNames: {
          "#field": fieldName,
        },
        ExpressionAttributeValues: {
          ":val": { S: value },
        },
      };

      await dynamo.send(new UpdateItemCommand(updateParams));
      console.log(`Updated ${id}: ${fieldName} = ${value}`);
    } catch (err) {
      console.error("Error processing metadata:", err);
    }
  }
};
