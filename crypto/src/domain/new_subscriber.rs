use crate::domain::subscriber_email_address::SubscriberEmailAddress;
use crate::domain::subscriber_name::SubscriberName;

#[derive(Debug)]
pub struct NewSubscriber {
    pub email: SubscriberEmailAddress,
    pub name: SubscriberName,
}
