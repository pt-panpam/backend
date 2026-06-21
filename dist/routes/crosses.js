"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sequelize_1 = require("sequelize");
const User_1 = require("../models/User");
const CrossSettings_1 = require("../models/CrossSettings");
const CrossEvent_1 = require("../models/CrossEvent");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Get cross settings
router.get('/settings/', auth_1.authenticate, async (req, res) => {
    let settings = await CrossSettings_1.CrossSettings.findOne({ where: { userId: req.user.id } });
    if (!settings) {
        settings = await CrossSettings_1.CrossSettings.create({ userId: req.user.id });
    }
    res.json({
        review_hour: settings.reviewHour,
        review_minute: settings.reviewMinute,
        reveal_delay_minutes: settings.revealDelayMinutes,
        updated_at: settings.updated_at,
        can_change: settings.canChange(),
    });
});
// Update cross settings
router.patch('/settings/', auth_1.authenticate, async (req, res) => {
    let settings = await CrossSettings_1.CrossSettings.findOne({ where: { userId: req.user.id } });
    if (!settings) {
        settings = await CrossSettings_1.CrossSettings.create({ userId: req.user.id });
    }
    if (!settings.canChange()) {
        res.status(400).json({ error: 'Cannot change settings yet. 10-day cooldown applies.' });
        return;
    }
    if (req.body.review_hour !== undefined)
        settings.reviewHour = req.body.review_hour;
    if (req.body.review_minute !== undefined)
        settings.reviewMinute = req.body.review_minute;
    await settings.save();
    res.json({
        review_hour: settings.reviewHour,
        review_minute: settings.reviewMinute,
        reveal_delay_minutes: settings.revealDelayMinutes,
        updated_at: settings.updated_at,
        can_change: settings.canChange(),
    });
});
// Get cross events
router.get('/events/', auth_1.authenticate, async (req, res) => {
    const events = await CrossEvent_1.CrossEvent.findAll({
        where: {
            [sequelize_1.Op.or]: [{ user1Id: req.user.id }, { user2Id: req.user.id }],
        },
        order: [['crossed_at', 'DESC']],
        limit: 50,
    });
    const results = await Promise.all(events.map(async (e) => {
        const otherId = e.user1Id === req.user.id ? e.user2Id : e.user1Id;
        const other = await User_1.User.findByPk(otherId);
        const isFriend = other ? true : false;
        // Jitter for non-participants
        let displayLat = e.latitude;
        let displayLng = e.longitude;
        if (!isFriend) {
            displayLat = e.latitude + (Math.random() - 0.5) * 0.02;
            displayLng = e.longitude + (Math.random() - 0.5) * 0.02;
        }
        return {
            id: e.id,
            other_user: other ? {
                id: other.id,
                username: other.username,
                first_name: other.firstName,
                last_name: other.lastName,
                profile_picture: other.profilePicture,
                age: other.age,
                location: other.location,
            } : null,
            latitude: e.latitude,
            longitude: e.longitude,
            display_latitude: displayLat,
            display_longitude: displayLng,
            crossed_at: e.crossedAt,
            published: e.published,
        };
    }));
    res.json({ results });
});
// Publish cross events for review window
router.post('/publish/', auth_1.authenticate, async (req, res) => {
    const events = await CrossEvent_1.CrossEvent.findAll({
        where: { published: false },
    });
    for (const e of events) {
        e.published = true;
        await e.save();
    }
    res.json({ detail: 'Published' });
});
// Report a cross (create)
router.post('/report/', auth_1.authenticate, async (req, res) => {
    const { user_id, latitude, longitude } = req.body;
    if (!user_id || !latitude || !longitude) {
        res.status(400).json({ error: 'user_id, latitude, and longitude required' });
        return;
    }
    const event = await CrossEvent_1.CrossEvent.create({
        user1Id: req.user.id,
        user2Id: user_id,
        latitude,
        longitude,
        published: true,
    });
    res.status(201).json({ id: event.id, detail: 'Cross reported' });
});
exports.default = router;
//# sourceMappingURL=crosses.js.map