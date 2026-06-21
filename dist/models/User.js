"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
exports.initUser = initUser;
const sequelize_1 = require("sequelize");
class User extends sequelize_1.Model {
    get age() {
        if (!this.dateOfBirth)
            return null;
        const today = new Date();
        const birth = new Date(this.dateOfBirth);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate()))
            age--;
        return age;
    }
}
exports.User = User;
function initUser(sequelize) {
    User.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        username: { type: sequelize_1.DataTypes.STRING(150), allowNull: false, unique: true },
        email: { type: sequelize_1.DataTypes.STRING, allowNull: false, unique: true },
        password: { type: sequelize_1.DataTypes.STRING, allowNull: false, defaultValue: '' },
        googleId: { type: sequelize_1.DataTypes.STRING(255), allowNull: true, unique: true, field: 'google_id' },
        firstName: { type: sequelize_1.DataTypes.STRING(150), defaultValue: '', field: 'first_name' },
        lastName: { type: sequelize_1.DataTypes.STRING(150), defaultValue: '', field: 'last_name' },
        profilePicture: { type: sequelize_1.DataTypes.STRING(500), defaultValue: '', field: 'profile_picture' },
        dateOfBirth: { type: sequelize_1.DataTypes.DATEONLY, allowNull: true, field: 'date_of_birth' },
        sex: { type: sequelize_1.DataTypes.STRING(30), defaultValue: '' },
        bio: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        location: { type: sequelize_1.DataTypes.STRING(255), defaultValue: '' },
        latitude: { type: sequelize_1.DataTypes.FLOAT, allowNull: true },
        longitude: { type: sequelize_1.DataTypes.FLOAT, allowNull: true },
        hobbies: { type: sequelize_1.DataTypes.JSON, defaultValue: [] },
        onboardingComplete: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: false, field: 'onboarding_complete' },
        isPrivate: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: false, field: 'is_private' },
        showOnlineStatus: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: true, field: 'show_online_status' },
        readReceipts: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: true, field: 'read_receipts' },
        pushLikes: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: true, field: 'push_likes' },
        pushComments: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: true, field: 'push_comments' },
        pushFollows: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: true, field: 'push_follows' },
        pushMessages: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: true, field: 'push_messages' },
        phoneNumber: { type: sequelize_1.DataTypes.STRING(20), defaultValue: '', field: 'phone_number' },
        whoCanMessage: { type: sequelize_1.DataTypes.STRING(20), defaultValue: 'everyone', field: 'who_can_message' },
        whoCanSeePosts: { type: sequelize_1.DataTypes.STRING(20), defaultValue: 'everyone', field: 'who_can_see_posts' },
        storyVisibility: { type: sequelize_1.DataTypes.STRING(20), defaultValue: 'everyone', field: 'story_visibility' },
        friendRequestMode: { type: sequelize_1.DataTypes.STRING(30), defaultValue: 'everyone', field: 'friend_request_mode' },
        theme: { type: sequelize_1.DataTypes.STRING(10), defaultValue: 'system' },
        language: { type: sequelize_1.DataTypes.STRING(10), defaultValue: 'en' },
        dataSaver: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: false, field: 'data_saver' },
        isActive: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
        isLive: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: false, field: 'is_live' },
        lastSeen: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW, field: 'last_seen' },
    }, {
        sequelize,
        tableName: 'users',
        timestamps: true,
        underscored: true,
    });
}
//# sourceMappingURL=User.js.map