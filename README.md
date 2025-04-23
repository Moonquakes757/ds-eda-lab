## Distributed Systems - Event-Driven Architecture.

__Name:__ Shaohua Xu 20108871

__Demo__: ....URL of YouTube demo ......

This repository contains the implementation of a skeleton design for an application that manages a photo gallery, illustrated below. The app uses an event-driven architecture and is deployed on the AWS platform using the CDK framework for infrastructure provisioning.

---

## Code Status

### Feature:

+ Photographer: 
  + Log new Images: Completed and Tested
    Image uploads to S3 trigger an SNS notification, which routes to an SQS queue and invokes a Lambda function that records the image (filename) in a DynamoDB table.

  + Metadata updating: Completed and Tested
    Photographers publish metadata (e.g. caption, name, date) via SNS with typed message attributes. Messages are filtered and routed to a Lambda that updates the DynamoDB record accordingly.

  + Invalid image removal: Completed and Tested
    Non-image files (e.g. `.txt`) trigger an exception in the processing Lambda, are redirected to a DLQ, and automatically removed by a cleanup Lambda.

  + Status Update Mailer: Attempted
    When a moderator updates the image status (Pass/Reject), a Lambda function listening to the SNS topic sends a confirmation email to the photographer using AWS SES. (I tried this part but failed)

---

+ Moderator:
  +Status updating: Completed and Tested
    Moderators submit review results via CLI. SNS messages are filtered to a specific SQS queue and processed by a Lambda function which updates the status and reason fields in DynamoDB.

  + Filtering: Completed and Tested
    SNS topic is subscribed to multiple queues with distinct filter policies to separate upload events, metadata updates, status updates, and mailing. Each Lambda function executes only when its relevant event is received.

  + Messaging: Completed and Tested
    Messaging between components (S3, SNS, SQS, Lambda, DynamoDB, SES) is fully event-driven and decoupled, in compliance with the specification.

---

## Notes (Optional)
- All features were implemented incrementally and thoroughly tested using AWS CLI, S3 Console, and CloudWatch Logs.
- CDK was used to define all infrastructure including S3, SNS, SQS, Lambda functions, and DynamoDB.
- Lambda logs were verified in CloudWatch to confirm correct function execution and error handling.
- SES configuration was validated in sandbox mode.
