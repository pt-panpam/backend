import { Sequelize } from 'sequelize';
import { User, initUser } from './User';
import { Hobby, initHobby } from './Hobby';
import { ProfileGallery, initProfileGallery } from './ProfileGallery';
import { FriendRequest, initFriendRequest } from './FriendRequest';
import { Friend, initFriend } from './Friend';
import { Block, initBlock } from './Block';
import { Post, initPost } from './Post';
import { PostPhoto, initPostPhoto } from './PostPhoto';
import { PostLike, initPostLike } from './PostLike';
import { SavedPost, initSavedPost } from './SavedPost';
import { Comment, initComment } from './Comment';
import { Conversation, initConversation } from './Conversation';
import { Message, initMessage } from './Message';
import { ConversationReadStatus, initConversationReadStatus } from './ConversationReadStatus';
import { Call, initCall } from './Call';
import { Notification, initNotification } from './Notification';
import { CrossSettings, initCrossSettings } from './CrossSettings';
import { CrossEvent, initCrossEvent } from './CrossEvent';
import { ProfileLike, initProfileLike } from './ProfileLike';

export function initModels(sequelize: Sequelize): void {
  initUser(sequelize);
  initHobby(sequelize);
  initProfileGallery(sequelize);
  initFriendRequest(sequelize);
  initFriend(sequelize);
  initBlock(sequelize);
  initPost(sequelize);
  initPostPhoto(sequelize);
  initPostLike(sequelize);
  initSavedPost(sequelize);
  initComment(sequelize);
  initConversation(sequelize);
  initMessage(sequelize);
  initConversationReadStatus(sequelize);
  initCall(sequelize);
  initNotification(sequelize);
  initCrossSettings(sequelize);
  initCrossEvent(sequelize);
  initProfileLike(sequelize);

  // Associations
  User.hasMany(Post, { foreignKey: 'userId', as: 'posts' });
  Post.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  Post.hasMany(PostPhoto, { foreignKey: 'postId', as: 'photos' });
  PostPhoto.belongsTo(Post, { foreignKey: 'postId', as: 'post' });

  Post.hasMany(PostLike, { foreignKey: 'postId', as: 'likes' });
  PostLike.belongsTo(Post, { foreignKey: 'postId', as: 'post' });

  Post.hasMany(SavedPost, { foreignKey: 'postId', as: 'saves' });
  SavedPost.belongsTo(Post, { foreignKey: 'postId', as: 'post' });

  Post.hasMany(Comment, { foreignKey: 'postId', as: 'comments' });
  Comment.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
  Comment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(Comment, { foreignKey: 'userId', as: 'comments' });

  PostLike.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  Conversation.belongsToMany(User, { through: 'conversation_participants', as: 'participants', foreignKey: 'conversationId', otherKey: 'userId', timestamps: false });
  User.belongsToMany(Conversation, { through: 'conversation_participants', as: 'conversations', foreignKey: 'userId', otherKey: 'conversationId', timestamps: false });

  Conversation.hasMany(Message, { foreignKey: 'conversationId', as: 'messages' });
  Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
  Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
  User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages' });

  Conversation.hasMany(ConversationReadStatus, { foreignKey: 'conversationId', as: 'readStatuses' });
  ConversationReadStatus.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });

  Call.belongsTo(User, { foreignKey: 'callerId', as: 'caller' });
  Call.belongsTo(User, { foreignKey: 'calleeId', as: 'callee' });

  FriendRequest.belongsTo(User, { foreignKey: 'fromUserId', as: 'fromUser' });
  FriendRequest.belongsTo(User, { foreignKey: 'toUserId', as: 'toUser' });

  Friend.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Friend.belongsTo(User, { foreignKey: 'friendId', as: 'friend' });

  Block.belongsTo(User, { foreignKey: 'blockerId', as: 'blocker' });
  Block.belongsTo(User, { foreignKey: 'blockedId', as: 'blocked' });

  Notification.belongsTo(User, { foreignKey: 'actorId', as: 'actor' });

  ProfileLike.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  ProfileLike.belongsTo(User, { foreignKey: 'likedUserId', as: 'likedUser' });
  User.hasMany(ProfileLike, { foreignKey: 'likedUserId', as: 'profileLikes' });
}

export {
  User,
  Hobby,
  ProfileGallery,
  FriendRequest,
  Friend,
  Block,
  Post,
  PostPhoto,
  PostLike,
  SavedPost,
  Comment,
  Conversation,
  Message,
  ConversationReadStatus,
  Call,
  Notification,
  CrossSettings,
  CrossEvent,
  ProfileLike,
};
