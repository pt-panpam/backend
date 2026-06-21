"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const google_auth_library_1 = require("google-auth-library");
const User_1 = require("../models/User");
const ProfileGallery_1 = require("../models/ProfileGallery");
const ProfileLike_1 = require("../models/ProfileLike");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const helpers_1 = require("../utils/helpers");
const googleClient = new google_auth_library_1.OAuth2Client();
const router = (0, express_1.Router)();
// Google auth — verify token, find or create user, return JWT
router.post('/google/', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            res.status(400).json({ error: 'idToken required' });
            return;
        }
        const ticket = await googleClient.verifyIdToken({ idToken, audience: undefined });
        const payload = ticket.getPayload();
        if (!payload || !payload.sub) {
            res.status(401).json({ error: 'Invalid Google token' });
            return;
        }
        if (payload.iss && !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
            res.status(401).json({ error: 'Invalid issuer' });
            return;
        }
        const googleId = payload.sub;
        const email = payload.email || '';
        const name = payload.name || '';
        const picture = payload.picture || '';
        let user = await User_1.User.findOne({ where: { googleId } });
        let created = false;
        if (!user) {
            user = await User_1.User.findOne({ where: { email } });
            if (user) {
                user.googleId = googleId;
                user.profilePicture = picture || user.profilePicture;
                await user.save();
            }
            else {
                const baseUsername = email.split('@')[0] || `user_${googleId.slice(0, 8)}`;
                let username = baseUsername;
                let counter = 1;
                while (await User_1.User.findOne({ where: { username } })) {
                    username = `${baseUsername}_${counter}`;
                    counter++;
                }
                user = await User_1.User.create({
                    username,
                    email,
                    googleId,
                    profilePicture: picture,
                    firstName: name.split(' ')[0] || '',
                    lastName: name.split(' ').slice(1).join(' ') || '',
                });
                created = true;
            }
        }
        const tokens = (0, helpers_1.generateTokens)(user);
        res.json({ ...tokens, onboarding_complete: user.onboardingComplete });
    }
    catch (err) {
        console.error('Google auth error:', err.message);
        res.status(401).json({ error: 'Invalid Google token' });
    }
});
// Signup — complete onboarding with Google data
router.post('/signup/', async (req, res) => {
    try {
        const { idToken, first_name, date_of_birth, sex, hobbies, bio, location, latitude, longitude } = req.body;
        if (!idToken) {
            res.status(400).json({ error: 'idToken required' });
            return;
        }
        const ticket = await googleClient.verifyIdToken({ idToken, audience: undefined });
        const payload = ticket.getPayload();
        if (!payload || !payload.sub) {
            res.status(401).json({ error: 'Invalid Google token' });
            return;
        }
        const googleId = payload.sub;
        const email = payload.email || '';
        const name = payload.name || '';
        const picture = payload.picture || '';
        let user = await User_1.User.findOne({ where: { googleId } });
        if (user) {
            user.firstName = first_name || user.firstName;
            user.dateOfBirth = date_of_birth || user.dateOfBirth;
            user.sex = sex || user.sex;
            user.hobbies = hobbies || user.hobbies;
            user.bio = bio !== undefined ? bio : user.bio;
            user.location = location || user.location;
            if (latitude !== undefined)
                user.latitude = latitude;
            if (longitude !== undefined)
                user.longitude = longitude;
            user.onboardingComplete = true;
            await user.save();
            const tokens = (0, helpers_1.generateTokens)(user);
            res.json({ ...tokens, onboarding_complete: true });
            return;
        }
        const baseUsername = email.split('@')[0] || `user_${googleId.slice(0, 8)}`;
        let username = baseUsername;
        let counter = 1;
        while (await User_1.User.findOne({ where: { username } })) {
            username = `${baseUsername}_${counter}`;
            counter++;
        }
        user = await User_1.User.create({
            username,
            email,
            googleId,
            profilePicture: picture,
            firstName: first_name || name.split(' ')[0] || '',
            lastName: name.split(' ').slice(1).join(' ') || '',
            dateOfBirth: date_of_birth || null,
            sex: sex || '',
            hobbies: hobbies || [],
            bio: bio || '',
            location: location || '',
            latitude: latitude || null,
            longitude: longitude || null,
            onboardingComplete: true,
        });
        const tokens = (0, helpers_1.generateTokens)(user);
        res.json({ ...tokens, onboarding_complete: true });
    }
    catch (err) {
        console.error('Signup error:', err.message);
        res.status(401).json({ error: 'Invalid Google token' });
    }
});
// Test login (dev only)
router.post('/test-login/', async (req, res) => {
    const { email, password } = req.body;
    const user = await User_1.User.findOne({ where: { email } });
    if (!user || !(await (0, helpers_1.comparePassword)(password, user.password))) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const tokens = (0, helpers_1.generateTokens)(user);
    res.json({ ...tokens, onboarding_complete: user.onboardingComplete });
});
// Refresh token
router.post('/refresh/', async (req, res) => {
    const { refresh } = req.body;
    if (!refresh) {
        res.status(400).json({ error: 'Refresh token required' });
        return;
    }
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(refresh, process.env.JWT_SECRET || 'dev-secret');
        const user = await User_1.User.findByPk(decoded.userId);
        if (!user) {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }
        const tokens = (0, helpers_1.generateTokens)(user);
        res.json(tokens);
    }
    catch {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});
// Get current user
router.get('/user/', auth_1.authenticate, async (req, res) => {
    const user = req.user;
    const data = (0, helpers_1.serializeUser)(user, user.id);
    res.json(data);
});
// Update current user
router.patch('/user/', auth_1.authenticate, async (req, res) => {
    const user = req.user;
    const allowed = ['first_name', 'last_name', 'username', 'bio', 'location', 'sex', 'phone_number', 'is_private', 'show_online_status', 'read_receipts', 'theme', 'language', 'data_saver', 'who_can_message', 'who_can_see_posts', 'story_visibility', 'friend_request_mode', 'onboarding_complete'];
    for (const key of allowed) {
        if (req.body[key] !== undefined) {
            const dbKey = key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
            user[dbKey] = req.body[key];
        }
    }
    await user.save();
    res.json((0, helpers_1.serializeUser)(user, user.id));
});
// Change password
router.post('/user/change-password/', auth_1.authenticate, async (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;
    if (new_password !== confirm_password) {
        res.status(400).json({ error: 'Passwords do not match' });
        return;
    }
    if (!(await (0, helpers_1.comparePassword)(current_password, req.user.password))) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
    }
    req.user.password = await (0, helpers_1.hashPassword)(new_password);
    await req.user.save();
    res.json({ detail: 'Password changed successfully' });
});
// Delete account
router.delete('/user/delete/', auth_1.authenticate, async (req, res) => {
    req.user.isActive = false;
    await req.user.save();
    res.status(204).send();
});
// Get user by ID (public profile)
router.get('/users/:id/', auth_1.authenticate, async (req, res) => {
    const user = await User_1.User.findByPk(Number(req.params.id));
    if (!user || !user.isActive) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const data = (0, helpers_1.serializeUser)(user, req.user.id);
    res.json(data);
});
// Search users
router.get('/users/', auth_1.authenticate, async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) {
        res.json([]);
        return;
    }
    const { Op } = require('sequelize');
    const users = await User_1.User.findAll({
        where: {
            id: { [Op.ne]: req.user.id },
            isActive: true,
            [Op.or]: [
                { firstName: { [Op.like]: `%${q}%` } },
                { lastName: { [Op.like]: `%${q}%` } },
                { username: { [Op.like]: `%${q}%` } },
            ],
        },
        limit: 20,
    });
    res.json(users.map(u => ({
        id: u.id,
        username: u.username,
        first_name: u.firstName,
        last_name: u.lastName,
        profile_picture: u.profilePicture,
        age: u.age,
        location: u.location,
    })));
});
// Update profile
router.patch('/user/profile/', auth_1.authenticate, async (req, res) => {
    const user = req.user;
    if (req.body.first_name !== undefined)
        user.firstName = req.body.first_name;
    if (req.body.bio !== undefined)
        user.bio = req.body.bio;
    if (req.body.location !== undefined)
        user.location = req.body.location;
    if (req.body.date_of_birth !== undefined)
        user.dateOfBirth = req.body.date_of_birth;
    if (req.body.sex !== undefined)
        user.sex = req.body.sex;
    if (req.body.hobbies !== undefined)
        user.hobbies = req.body.hobbies;
    if (req.body.latitude !== undefined)
        user.latitude = req.body.latitude;
    if (req.body.longitude !== undefined)
        user.longitude = req.body.longitude;
    await user.save();
    res.json((0, helpers_1.serializeUser)(user, user.id));
});
// Account settings
router.get('/user/account/', auth_1.authenticate, (req, res) => {
    const u = req.user;
    res.json({ first_name: u.firstName, last_name: u.lastName, username: u.username, email: u.email, phone_number: u.phoneNumber });
});
router.patch('/user/account/', auth_1.authenticate, async (req, res) => {
    const u = req.user;
    if (req.body.first_name !== undefined)
        u.firstName = req.body.first_name;
    if (req.body.last_name !== undefined)
        u.lastName = req.body.last_name;
    if (req.body.phone_number !== undefined)
        u.phoneNumber = req.body.phone_number;
    await u.save();
    res.json({ first_name: u.firstName, last_name: u.lastName, username: u.username, email: u.email, phone_number: u.phoneNumber });
});
// Privacy settings
router.get('/user/privacy/', auth_1.authenticate, (req, res) => {
    const u = req.user;
    res.json({ is_private: u.isPrivate, show_online_status: u.showOnlineStatus, read_receipts: u.readReceipts });
});
router.patch('/user/privacy/', auth_1.authenticate, async (req, res) => {
    const u = req.user;
    if (req.body.is_private !== undefined)
        u.isPrivate = req.body.is_private;
    if (req.body.show_online_status !== undefined)
        u.showOnlineStatus = req.body.show_online_status;
    if (req.body.read_receipts !== undefined)
        u.readReceipts = req.body.read_receipts;
    await u.save();
    res.json({ is_private: u.isPrivate, show_online_status: u.showOnlineStatus, read_receipts: u.readReceipts });
});
// Notification settings
router.get('/user/notifications/', auth_1.authenticate, (req, res) => {
    const u = req.user;
    res.json({ push_likes: u.pushLikes, push_comments: u.pushComments, push_follows: u.pushFollows, push_messages: u.pushMessages });
});
router.patch('/user/notifications/', auth_1.authenticate, async (req, res) => {
    const u = req.user;
    if (req.body.push_likes !== undefined)
        u.pushLikes = req.body.push_likes;
    if (req.body.push_comments !== undefined)
        u.pushComments = req.body.push_comments;
    if (req.body.push_follows !== undefined)
        u.pushFollows = req.body.push_follows;
    if (req.body.push_messages !== undefined)
        u.pushMessages = req.body.push_messages;
    await u.save();
    res.json({ push_likes: u.pushLikes, push_comments: u.pushComments, push_follows: u.pushFollows, push_messages: u.pushMessages });
});
// Location settings
router.get('/user/location/', auth_1.authenticate, (req, res) => {
    const u = req.user;
    res.json({ location: u.location, latitude: u.latitude, longitude: u.longitude });
});
router.patch('/user/location/', auth_1.authenticate, async (req, res) => {
    const u = req.user;
    if (req.body.location !== undefined)
        u.location = req.body.location;
    if (req.body.latitude !== undefined)
        u.latitude = req.body.latitude;
    if (req.body.longitude !== undefined)
        u.longitude = req.body.longitude;
    await u.save();
    res.json({ location: u.location, latitude: u.latitude, longitude: u.longitude });
});
// Upload avatar
router.post('/user/avatar/', auth_1.authenticate, upload_1.upload.single('profile_picture'), async (req, res) => {
    const user = req.user;
    if (req.file) {
        user.profilePicture = `/uploads/${req.file.filename}`;
    }
    else if (req.body.profile_picture) {
        user.profilePicture = req.body.profile_picture;
    }
    await user.save();
    res.json((0, helpers_1.serializeUser)(user, user.id));
});
// Gallery — list (paginated)
router.get('/user/gallery/', auth_1.authenticate, async (req, res) => {
    const images = await ProfileGallery_1.ProfileGallery.findAll({
        where: { userId: req.user.id },
        order: [['order', 'ASC']],
    });
    res.json({ results: images.map(g => ({ id: g.id, image: g.image, order: g.order })) });
});
// Gallery — list for any user
router.get('/users/:userId/gallery/', auth_1.authenticate, async (req, res) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
    }
    const images = await ProfileGallery_1.ProfileGallery.findAll({
        where: { userId },
        order: [['order', 'ASC']],
    });
    res.json({ results: images.map(g => ({ id: g.id, image: g.image, order: g.order })) });
});
// Gallery — upload
router.post('/user/gallery/', auth_1.authenticate, upload_1.upload.single('image'), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'image is required' });
        return;
    }
    const order = req.body.order !== undefined ? Number(req.body.order) : 0;
    const img = await ProfileGallery_1.ProfileGallery.create({
        userId: req.user.id,
        image: `/uploads/${req.file.filename}`,
        order,
    });
    res.status(201).json({ id: img.id, image: img.image, order: img.order });
});
// Gallery — delete
router.delete('/user/gallery/:id/delete/', auth_1.authenticate, async (req, res) => {
    const img = await ProfileGallery_1.ProfileGallery.findOne({
        where: { id: Number(req.params.id), userId: req.user.id },
    });
    if (!img) {
        res.status(404).json({ error: 'Image not found' });
        return;
    }
    await img.destroy();
    res.status(204).send();
});
// Get hobbies
router.get('/hobbies/', async (_req, res) => {
    const { Hobby } = require('../models/Hobby');
    const hobbies = await Hobby.findAll();
    res.json(hobbies);
});
// Profile likes — like a user's profile
router.post('/user/:id/like/', auth_1.authenticate, async (req, res) => {
    try {
        const likedUserId = Number(req.params.id);
        if (likedUserId === req.user.id) {
            res.status(400).json({ error: 'Cannot like your own profile' });
            return;
        }
        const target = await User_1.User.findByPk(likedUserId);
        if (!target) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const [like, created] = await ProfileLike_1.ProfileLike.findOrCreate({
            where: { userId: req.user.id, likedUserId },
            defaults: { userId: req.user.id, likedUserId },
        });
        res.status(created ? 201 : 200).json({ id: like.id });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to like profile' });
    }
});
// Profile likes — unlike a user's profile
router.delete('/user/:id/unlike/', auth_1.authenticate, async (req, res) => {
    try {
        const likedUserId = Number(req.params.id);
        const deleted = await ProfileLike_1.ProfileLike.destroy({
            where: { userId: req.user.id, likedUserId },
        });
        res.status(deleted ? 204 : 404).send();
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to unlike profile' });
    }
});
// Profile likes — get users who liked a profile
router.get('/user/:id/likes/', auth_1.authenticate, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const likes = await ProfileLike_1.ProfileLike.findAll({
            where: { likedUserId: userId },
            include: [{ model: User_1.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'profilePicture', 'location'] }],
        });
        res.json({ count: likes.length, users: likes.map((l) => l.user) });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to get likes' });
    }
});
// Profile likes — check if current user liked a profile
router.get('/user/:id/liked/', auth_1.authenticate, async (req, res) => {
    try {
        const likedUserId = Number(req.params.id);
        const like = await ProfileLike_1.ProfileLike.findOne({
            where: { userId: req.user.id, likedUserId },
        });
        res.json({ liked: !!like });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to check like' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map