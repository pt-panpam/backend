import { sequelize } from './config/database';
import { initModels, User, Conversation, Message, ConversationReadStatus } from './models';

async function addMessagesToAbhi() {
  console.log('Initializing models...');
  initModels(sequelize);
  await sequelize.sync({ force: false });
  console.log('Database synced');

  const abhi = await User.findOne({ where: { username: 'abhi' } });
  if (!abhi) {
    console.error('User "abhi" not found!');
    process.exit(1);
  }
  console.log(`Found abhi (id: ${abhi.id})`);

  const otherUsers = await User.findAll({
    where: { id: { [require('sequelize').Op.ne]: abhi.id } },
    limit: 6,
  });
  console.log(`Found ${otherUsers.length} other users`);

  const conversations = [
    {
      other: otherUsers[0],
      messages: [
        { from: 'other', text: 'Hey Abhi! Just saw your latest project — the UI is absolutely fire 🔥' },
        { from: 'abhi', text: 'Thanks! Been working on it nonstop for the past week' },
        { from: 'other', text: 'The animations are so smooth. What library did you use?' },
        { from: 'abhi', text: 'React Native Reanimated 3 — it\'s a game changer' },
        { from: 'other', text: 'We should collab sometime, I have an idea for a cool feature' },
        { from: 'abhi', text: 'Definitely! DM me the details' },
      ],
    },
    {
      other: otherUsers[1],
      messages: [
        { from: 'other', text: 'Are you coming to the meetup this Saturday?' },
        { from: 'abhi', text: 'Which one? The Bangalore dev meetup?' },
        { from: 'other', text: 'Yeah! There\'s gonna be a talk on AI in mobile apps' },
        { from: 'abhi', text: 'Oh nice, I\'m definitely in. What time does it start?' },
        { from: 'other', text: '3 PM at WeWork Koramangala' },
        { from: 'abhi', text: 'Perfect, see you there!' },
        { from: 'other', text: 'Also bring your camera, the venue has an amazing rooftop view 📸' },
      ],
    },
    {
      other: otherUsers[2],
      messages: [
        { from: 'abhi', text: 'Hey! I noticed you\'re into photography too' },
        { from: 'other', text: 'Yes! Love street photography especially' },
        { from: 'abhi', text: 'Same! I just got a new lens — Sigma 35mm f/1.4' },
        { from: 'other', text: 'That\'s a beast! How\'s the bokeh on it?' },
        { from: 'abhi', text: 'Insane. Check out my latest post, shot entirely with it' },
        { from: 'other', text: 'Just saw it — the depth of field is incredible' },
      ],
    },
    {
      other: otherUsers[3],
      messages: [
        { from: 'other', text: 'Abhi! Long time no talk 😄' },
        { from: 'abhi', text: 'Hey! How\'s life treating you?' },
        { from: 'other', text: 'Busy but good. Started a new role last month' },
        { from: 'abhi', text: 'Congrats! What are you working on?' },
        { from: 'other', text: 'Building a fintech app from scratch. It\'s hectic but exciting' },
        { from: 'abhi', text: 'That sounds awesome. Let me know if you need any design help' },
        { from: 'other', text: 'Will do! Your design sense is 🔥' },
      ],
    },
    {
      other: otherUsers[4],
      messages: [
        { from: 'other', text: 'Quick question — what do you use for state management?' },
        { from: 'abhi', text: 'Zustand for most things, React Query for server state' },
        { from: 'other', text: 'No Redux?' },
        { from: 'abhi', text: 'Not anymore. Zustand is way simpler and less boilerplate' },
        { from: 'other', text: 'Fair enough. I\'ve been thinking of migrating' },
        { from: 'abhi', text: 'Do it! You won\'t look back. I can help if you want' },
      ],
    },
    {
      other: otherUsers[5],
      messages: [
        { from: 'abhi', text: 'Happy birthday! 🎂🎉' },
        { from: 'other', text: 'Thank you so much! 🥳' },
        { from: 'abhi', text: 'How are you celebrating?' },
        { from: 'other', text: 'Small gathering at home with close friends' },
        { from: 'abhi', text: 'Sounds perfect. Wish I could be there!' },
        { from: 'other', text: 'Next time for sure! We should plan a trip together' },
        { from: 'abhi', text: 'Absolutely! Maybe a Goa trip this winter?' },
        { from: 'other', text: 'Yes please! Count me in 🙌' },
      ],
    },
  ];

  let messagesCreated = 0;

  for (const convo of conversations) {
    const conv = await Conversation.create() as any;
    await conv.setParticipants([abhi.id, convo.other.id]);

    console.log(`\nCreated conversation with ${convo.other.firstName} (${convo.other.username})`);

    for (let i = 0; i < convo.messages.length; i++) {
      const m = convo.messages[i];
      const senderId = m.from === 'abhi' ? abhi.id : convo.other.id;
      const timeOffset = i * 3600000 * (1 + Math.random()); // stagger by ~1-2 hours

      const msg = await Message.create({
        conversationId: conv.id,
        senderId,
        text: m.text,
        isRead: true,
        created_at: new Date(Date.now() - (convo.messages.length - i) * 3600000),
      } as any);

      messagesCreated++;

      if (i === convo.messages.length - 1) {
        await ConversationReadStatus.upsert({
          conversationId: conv.id,
          userId: abhi.id,
          lastReadMessageId: msg.id,
        } as any);
      }
    }

    console.log(`  Added ${convo.messages.length} messages`);
  }

  console.log(`\nDone! Created ${conversations.length} conversations with ${messagesCreated} total messages for abhi.`);
  process.exit(0);
}

addMessagesToAbhi().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
