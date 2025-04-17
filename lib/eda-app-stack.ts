import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as path from "path";

import { Construct } from "constructs";

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    // === Dead Letter Queue for failed image processing ===
    const imageDLQ = new sqs.Queue(this, "image-dlq");

    // === SQS queue for image upload events ===
    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: imageDLQ,
      },
    });

    const mailerQ = new sqs.Queue(this, "mailer-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    // === SQS queue for metadata updates ===
    const metadataQueue = new sqs.Queue(this, "metadata-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    // === SQS queue for moderator status updates ===
    const statusQueue = new sqs.Queue(this, "status-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    // === SNS topic for new image and metadata messages ===
    const newImageTopic = new sns.Topic(this, "NewImageTopic", {
      displayName: "New Image topic",
    });

    // === S3 -> SNS: trigger topic when an object is created ===
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(newImageTopic)
    );

    // === SNS -> SQS: only route upload events (no metadata_type) to image queue ===
    newImageTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue)
    );

    // === SNS -> Mailer Queue: no filter for now (can adjust later) ===
    newImageTopic.addSubscription(new subs.SqsSubscription(mailerQ));

    // === SNS -> Metadata Queue: filter only messages with metadata_type ===
    newImageTopic.addSubscription(
      new subs.SqsSubscription(metadataQueue, {
        filterPolicy: {
          metadata_type: sns.SubscriptionFilter.stringFilter({
            matchPrefixes: ["Caption", "Date", "Name"],
          }),
        },
      })
    );

    // === SNS -> Status Queue: exclude metadata_type messages ===
    newImageTopic.addSubscription(
      new subs.SqsSubscription(statusQueue, {
        filterPolicy: {
          metadata_type: sns.SubscriptionFilter.stringFilter({
            matchPrefixes: ["Status"],
          }),
        },
      })
    );

    const imageTable = new dynamodb.Table(this, "ImageTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const processImageFn = new lambdanode.NodejsFunction(
      this,
      "ProcessImageFn",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageTable.tableName,
        },
      }
    );

    imageTable.grantWriteData(processImageFn);

    const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/mailer.ts`,
    });

    // === Lambda function to remove invalid files from S3 (triggered by DLQ) ===
    const removeImageFn = new lambdanode.NodejsFunction(this, "RemoveImageFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambdas/removeImage.ts"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    // === Lambda function to update image metadata in DynamoDB ===
    const addMetadataFn = new lambdanode.NodejsFunction(this, "AddMetadataFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambdas/addMetadata.ts"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: imageTable.tableName,
      },
    });

    imageTable.grantWriteData(addMetadataFn);

    // === Lambda function to update image review status ===
    const updateStatusFn = new lambdanode.NodejsFunction(this, "UpdateStatusFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambdas/updateStatus.ts"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: imageTable.tableName,
      },
    });

    imageTable.grantWriteData(updateStatusFn);

    // === SQS -> Lambda event source binding ===
    processImageFn.addEventSource(
      new events.SqsEventSource(imageProcessQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    mailerFn.addEventSource(
      new events.SqsEventSource(mailerQ, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    removeImageFn.addEventSource(
      new events.SqsEventSource(imageDLQ, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    addMetadataFn.addEventSource(
      new events.SqsEventSource(metadataQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    updateStatusFn.addEventSource(
      new events.SqsEventSource(statusQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    // === Grant S3 access permissions ===
    imagesBucket.grantRead(processImageFn);
    imagesBucket.grantDelete(removeImageFn);

    mailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    // === CDK output: bucket name ===
    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });
  }
}
