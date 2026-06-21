"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTokens = generateTokens;
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
exports.serializeUser = serializeUser;
exports.serializeUserProfile = serializeUserProfile;
exports.serializePost = serializePost;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const env_1 = require("../config/env");
function generateTokens(user) {
    const payload = { userId: user.id, email: user.email };
    const access = jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, { expiresIn: env_1.env.JWT_ACCESS_EXPIRES_IN });
    const refresh = jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, { expiresIn: env_1.env.JWT_REFRESH_EXPIRES_IN });
    return { access, refresh };
}
async function hashPassword(password) {
    return bcryptjs_1.default.hash(password, 10);
}
async function comparePassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
function serializeUser(user, currentUserId) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        profile_picture: user.profilePicture,
        date_of_birth: user.dateOfBirth,
        age: user.age,
        sex: user.sex,
        bio: user.bio,
        location: user.location,
        latitude: user.latitude,
        longitude: user.longitude,
        hobbies: user.hobbies,
        onboarding_complete: user.onboardingComplete,
        is_private: user.isPrivate,
        show_online_status: user.showOnlineStatus,
        read_receipts: user.readReceipts,
        last_seen: user.lastSeen,
        created_at: user.created_at,
        total_crosses: 0,
        friend_count: 0,
        is_friend: false,
        friend_request_status: null,
        phone_number: user.phoneNumber,
        who_can_message: user.whoCanMessage,
        who_can_see_posts: user.whoCanSeePosts,
        story_visibility: user.storyVisibility,
        friend_request_mode: user.friendRequestMode,
        theme: user.theme,
        language: user.language,
        data_saver: user.dataSaver,
    };
}
function serializeUserProfile(user) {
    return {
        id: user.id,
        username: user.username,
        first_name: user.firstName,
        last_name: user.lastName,
        profile_picture: user.profilePicture,
        age: user.age,
        sex: user.sex,
        bio: user.bio,
        location: user.location,
        hobbies: user.hobbies,
        total_crosses: 0,
        friend_count: 0,
        is_friend: false,
        friend_request_status: null,
        last_seen: user.lastSeen,
    };
}
function serializePost(post, currentUserId) {
    return {
        id: post.id,
        user: post.user ? {
            id: post.user.id,
            username: post.user.username,
            first_name: post.user.firstName,
            last_name: post.user.lastName,
            profile_picture: post.user.profilePicture,
        } : { id: post.userId },
        caption: post.caption,
        location: post.location,
        latitude: post.latitude,
        longitude: post.longitude,
        photos: (post.photos || []).map((p) => ({
            id: p.id,
            image: p.image,
            order: p.order,
        })),
        like_count: post.likeCount || 0,
        has_liked: post.hasLiked || false,
        is_expired: post.expiresAt ? new Date(post.expiresAt).getTime() <= Date.now() : false,
        is_saved: post.isSaved || false,
        is_active: post.isActive,
        created_at: post.created_at,
        expires_at: post.expiresAt,
    };
}
//# sourceMappingURL=helpers.js.map