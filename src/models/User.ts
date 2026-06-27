import { DataTypes, Model, Sequelize } from 'sequelize';

export class User extends Model {
  declare id: number;
  declare username: string;
  declare email: string;
  declare password: string;
  declare googleId: string | null;
  declare firstName: string;
  declare lastName: string;
  declare profilePicture: string;
  declare dateOfBirth: string | null;
  declare sex: string;
  declare lookingFor: string;
  declare bio: string;
  declare location: string;
  declare latitude: number | null;
  declare longitude: number | null;
  declare hobbies: string[];
  declare onboardingComplete: boolean;
  declare isPrivate: boolean;
  declare showOnlineStatus: boolean;
  declare readReceipts: boolean;
  declare pushLikes: boolean;
  declare pushComments: boolean;
  declare pushFollows: boolean;
  declare pushMessages: boolean;
  declare pushCrosses: boolean;
  declare expoPushToken: string | null;
  declare phoneNumber: string;
  declare whoCanMessage: string;
  declare whoCanSeePosts: string;
  declare storyVisibility: string;
  declare friendRequestMode: string;
  declare theme: string;
  declare language: string;
  declare dataSaver: boolean;
  declare isActive: boolean;
  declare isLive: boolean;
  declare lastSeen: Date;
  declare created_at: Date;
  declare updated_at: Date;

  get age(): number | null {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birth = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }
}

export function initUser(sequelize: Sequelize): void {
  User.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
    googleId: { type: DataTypes.STRING(255), allowNull: true, unique: true, field: 'google_id' },
    firstName: { type: DataTypes.STRING(150), defaultValue: '', field: 'first_name' },
    lastName: { type: DataTypes.STRING(150), defaultValue: '', field: 'last_name' },
    profilePicture: { type: DataTypes.STRING(500), defaultValue: '', field: 'profile_picture' },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true, field: 'date_of_birth' },
    sex: { type: DataTypes.STRING(30), defaultValue: '' },
    lookingFor: { type: DataTypes.STRING(30), defaultValue: '', field: 'looking_for' },
    bio: { type: DataTypes.TEXT, defaultValue: '' },
    location: { type: DataTypes.STRING(255), defaultValue: '' },
    latitude: { type: DataTypes.FLOAT, allowNull: true },
    longitude: { type: DataTypes.FLOAT, allowNull: true },
    hobbies: { type: DataTypes.JSON, defaultValue: [] },
    onboardingComplete: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'onboarding_complete' },
    isPrivate: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_private' },
    showOnlineStatus: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'show_online_status' },
    readReceipts: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'read_receipts' },
    pushLikes: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'push_likes' },
    pushComments: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'push_comments' },
    pushFollows: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'push_follows' },
    pushMessages: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'push_messages' },
    pushCrosses: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'push_crosses' },
    expoPushToken: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null, field: 'expo_push_token' },
    phoneNumber: { type: DataTypes.STRING(20), defaultValue: '', field: 'phone_number' },
    whoCanMessage: { type: DataTypes.STRING(20), defaultValue: 'everyone', field: 'who_can_message' },
    whoCanSeePosts: { type: DataTypes.STRING(20), defaultValue: 'everyone', field: 'who_can_see_posts' },
    storyVisibility: { type: DataTypes.STRING(20), defaultValue: 'everyone', field: 'story_visibility' },
    friendRequestMode: { type: DataTypes.STRING(30), defaultValue: 'everyone', field: 'friend_request_mode' },
    theme: { type: DataTypes.STRING(10), defaultValue: 'system' },
    language: { type: DataTypes.STRING(10), defaultValue: 'en' },
    dataSaver: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'data_saver' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    isLive: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_live' },
    lastSeen: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'last_seen' },
  }, {
    sequelize,
    tableName: 'users',
    timestamps: true,
    underscored: true,
  });
}
