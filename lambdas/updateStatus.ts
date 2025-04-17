/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({});
const tableName = process.env.TABLE_NAME!;

export const handler: SQSHandler = async (event) => {
  console.log("UpdateStatus Lambda triggered");

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const snsMessage = JSON.parse(body.Message);

      const id = snsMessage.id;
      const date = snsMessage.date;
      const status = snsMessage.update?.status;
      const reason = snsMessage.update?.reason;

      if (!id || !date || !status || !reason) {
        throw new Error("Missing required fields in status update message.");
      }

      if (status !== "Pass" && status !== "Reject") {
        throw new Error(`Invalid status value: ${status}`);
      }

      const updateParams = {
        TableName: tableName,
        Key: { id: { S: id } },
        UpdateExpression: "SET #st = :s, #rs = :r, #dt = :d",
        ExpressionAttributeNames: {
          "#st": "status",
          "#rs": "reason",
          "#dt": "reviewDate",
        },
        ExpressionAttributeValues: {
          ":s": { S: status },
          ":r": { S: reason },
          ":d": { S: date },
        },
      };

      await dynamo.send(new UpdateItemCommand(updateParams));

      console.log(`Updated status for ${id}: ${status}, reason: ${reason}`);
    } catch (err) {
      console.error("Error processing status update:", err);
    }
  }
};
