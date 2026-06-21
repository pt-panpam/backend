import { sequelize } from './config/database';
import { initModels, User, Post, PostPhoto, PostLike, Comment, Friend, FriendRequest, Conversation, Message, ConversationReadStatus, Notification, Hobby } from './models';
import { hashPassword } from './utils/helpers';

async function seed() {
  console.log('Initializing models...');
  initModels(sequelize);
  await sequelize.sync({ force: true });
  console.log('Database synced (force reset)');

  // Create hobbies
  const hobbyData = [
    'Photography', 'Travel', 'Music', 'Cooking', 'Fitness',
    'Reading', 'Gaming', 'Art', 'Dancing', 'Swimming',
    'Hiking', 'Yoga', 'Cycling', 'Movies', 'Fashion',
  ];
  const hobbies = await Hobby.bulkCreate(hobbyData.map(name => ({ name } as any)));
  console.log(`Created ${hobbies.length} hobbies`);

  // Create users
  const usersData = [
    { email: 'alice@test.com', username: 'alice', firstName: 'Alice', lastName: 'Johnson', bio: 'Love photography and nature 🌿', location: 'New York, USA', profilePicture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice', sex: 'female', dateOfBirth: '1995-03-15' },
    { email: 'bob@test.com', username: 'bob', firstName: 'Bob', lastName: 'Smith', bio: 'Software developer & coffee lover ☕', location: 'San Francisco, USA', profilePicture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob', sex: 'male', dateOfBirth: '1993-07-22' },
    { email: 'charlie@test.com', username: 'charlie', firstName: 'Charlie', lastName: 'Brown', bio: 'Music is life 🎵', location: 'Chicago, USA', profilePicture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie', sex: 'male', dateOfBirth: '1997-11-08' },
    { email: 'diana@test.com', username: 'diana', firstName: 'Diana', lastName: 'Prince', bio: 'Adventure seeker 🏔️', location: 'Los Angeles, USA', profilePicture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=diana', sex: 'female', dateOfBirth: '1994-05-30' },
    { email: 'eve@test.com', username: 'eve', firstName: 'Eve', lastName: 'Chen', bio: 'Foodie & traveler ✈️', location: 'Seattle, USA', profilePicture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=eve', sex: 'female', dateOfBirth: '1996-09-12' },
    { email: 'frank@test.com', username: 'frank', firstName: 'Frank', lastName: 'Wilson', bio: 'Fitness enthusiast 💪', location: 'Miami, USA', profilePicture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=frank', sex: 'male', dateOfBirth: '1992-01-25' },
    { email: 'relohorizon@gmail.com', username: 'relohorizon', firstName: 'Relo', lastName: 'Horizon', bio: 'Full-stack developer & creator', location: 'Remote', profilePicture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=relohorizon', sex: 'male', dateOfBirth: '1990-06-15' },
    { email: 'cipherdecoit@gmail.com', username: 'cipherdecoit', firstName: 'Cipher', lastName: 'Decoit', bio: 'Security researcher & puzzle solver', location: 'Cyber City', profilePicture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=cipherdecoit', sex: 'male', dateOfBirth: '1991-04-20' },
  ];

  const password = await hashPassword('testpass123');
  const users = await Promise.all(usersData.map(u => User.create({ ...u, password, isActive: true, onboardingComplete: true } as any)));
  console.log(`Created ${users.length} users`);

  // Make all users friends (complete graph)
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      await Friend.bulkCreate([
        { userId: users[i].id, friendId: users[j].id },
        { userId: users[j].id, friendId: users[i].id },
      ] as any[]);
    }
  }
  console.log('Created friendships (complete graph)');

  // Create FriendRequest records for accepted friendships
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      await FriendRequest.create({ fromUserId: users[i].id, toUserId: users[j].id, status: 'accepted' } as any);
    }
  }
  console.log('Created friend request records');

  // Create posts with photos
  const postContents = [
    { caption: 'Beautiful sunset at the beach! 🏖️', location: 'Malibu Beach', lat: 34.0259, lng: -118.7798, photos: ['https://picsum.photos/seed/sunset1/400/600', 'https://picsum.photos/seed/sunset2/400/600'] },
    { caption: 'Morning coffee vibes ☕', location: 'Downtown Cafe', lat: 40.7128, lng: -74.0060, photos: ['https://picsum.photos/seed/coffee1/400/600', 'https://picsum.photos/seed/coffee2/400/600', 'https://picsum.photos/seed/coffee3/400/600'] },
    { caption: 'Hiking adventure today! 🥾', location: 'Yosemite National Park', lat: 37.8651, lng: -119.5383, photos: ['https://picsum.photos/seed/hike1/400/600', 'https://picsum.photos/seed/hike2/400/600'] },
    { caption: 'New recipe I tried 🍳', location: 'Home Kitchen', lat: 40.7282, lng: -73.7949, photos: ['https://picsum.photos/seed/food1/400/600'] },
    { caption: 'Concert was amazing! 🎵', location: 'Madison Square Garden', lat: 40.7505, lng: -73.9934, photos: ['https://picsum.photos/seed/concert1/400/600', 'https://picsum.photos/seed/concert2/400/600', 'https://picsum.photos/seed/concert3/400/600'] },
    { caption: 'City lights at night 🌃', location: 'Manhattan Skyline', lat: 40.7580, lng: -73.9855, photos: ['https://picsum.photos/seed/city1/400/600', 'https://picsum.photos/seed/city2/400/600'] },
    { caption: 'Weekend getaway 🚗', location: 'Lake Tahoe', lat: 39.0968, lng: -120.0324, photos: ['https://picsum.photos/seed/tahoe1/400/600'] },
    { caption: 'Fresh smoothie bowl 🥣', location: 'Acai Spot', lat: 25.7617, lng: -80.1918, photos: ['https://picsum.photos/seed/smoothie1/400/600', 'https://picsum.photos/seed/smoothie2/400/600'] },
    { caption: 'Art gallery exploration 🎨', location: 'MoMA', lat: 40.7614, lng: -73.9776, photos: ['https://picsum.photos/seed/art1/400/600', 'https://picsum.photos/seed/art2/400/600', 'https://picsum.photos/seed/art3/400/600', 'https://picsum.photos/seed/art4/400/600'] },
    { caption: 'Beach day! 🌊', location: 'Santa Monica', lat: 34.0095, lng: -118.4973, photos: ['https://picsum.photos/seed/beach1/400/600'] },
    { caption: 'Late night coding session 💻', location: 'Home Office', lat: 37.7749, lng: -122.4194, photos: ['https://picsum.photos/seed/coding1/400/600', 'https://picsum.photos/seed/coding2/400/600'] },
    { caption: 'Farmers market finds 🥬', location: 'Union Square Market', lat: 40.7359, lng: -73.9911, photos: ['https://picsum.photos/seed/market1/400/600'] },
    { caption: 'Yoga at sunrise 🧘', location: 'Rooftop Studio', lat: 40.7484, lng: -73.9967, photos: ['https://picsum.photos/seed/yoga1/400/600', 'https://picsum.photos/seed/yoga2/400/600'] },
    { caption: 'New bookstore discovery 📚', location: 'The Strand', lat: 40.7527, lng: -73.9906, photos: ['https://picsum.photos/seed/book1/400/600', 'https://picsum.photos/seed/book2/400/600'] },
    { caption: 'Street photography session 📸', location: 'Brooklyn Bridge', lat: 40.7061, lng: -73.9969, photos: ['https://picsum.photos/seed/street1/400/600'] },
    { caption: 'Garden bloom 🌸', location: 'Botanical Garden', lat: 40.8624, lng: -73.8838, photos: ['https://picsum.photos/seed/garden1/400/600', 'https://picsum.photos/seed/garden2/400/600', 'https://picsum.photos/seed/garden3/400/600'] },
    { caption: 'Film night 🎬', location: 'Home Theater', lat: 34.0522, lng: -118.2437, photos: ['https://picsum.photos/seed/film1/400/600'] },
  ];

  const posts = [];
  for (let i = 0; i < postContents.length; i++) {
    const user = users[i % users.length];
    const pc = postContents[i];
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const post = await Post.create({
      userId: user.id,
      caption: pc.caption,
      location: pc.location,
      latitude: pc.lat,
      longitude: pc.lng,
      expiresAt,
      isActive: true,
    } as any);

    for (let p = 0; p < pc.photos.length; p++) {
      await PostPhoto.create({ postId: post.id, image: pc.photos[p], order: p } as any);
    }

    posts.push(post);
  }
  console.log(`Created ${posts.length} posts`);

  // Add likes
  for (const post of posts) {
    const likers = users.filter(u => u.id !== post.userId).slice(0, 3 + Math.floor(Math.random() * 4));
    for (const liker of likers) {
      await PostLike.findOrCreate({ where: { userId: liker.id, postId: post.id } as any, defaults: { userId: liker.id, postId: post.id, likeType: 'like' } as any });
    }
  }
  console.log('Added likes');

  // Add comments
  const commentTexts = [
    'This is amazing! 🔥', 'Love this! 😍', 'So cool!', 'Great shot! 📸',
    'Where is this?', 'Incredible!', 'Goals! ✨', 'Beautiful!',
    'I need to visit this place', 'Nice one! 👏',
  ];
  for (const post of posts) {
    const commenters = users.filter(u => u.id !== post.userId).slice(0, 2 + Math.floor(Math.random() * 3));
    for (const commenter of commenters) {
      const text = commentTexts[Math.floor(Math.random() * commentTexts.length)];
      await Comment.create({ postId: post.id, userId: commenter.id, text } as any);
    }
  }
  console.log('Added comments');

  // Create conversations
  const convPairs = [
    [users[0], users[1]], [users[0], users[2]], [users[1], users[2]],
    [users[0], users[3]], [users[1], users[4]], [users[2], users[5]],
    [users[3], users[4]], [users[3], users[5]], [users[4], users[5]],
    [users[0], users[5]], [users[1], users[3]], [users[2], users[4]],
    [users[6], users[0]], [users[6], users[7]], [users[7], users[0]],
  ];

  const messageTexts = [
    'Hey! How are you?', 'I saw your post, amazing!', 'Want to grab coffee?',
    'Sure! When are you free?', 'How about tomorrow?', 'Perfect! See you then!',
    'Did you see the game last night?', 'Yeah, it was incredible!',
    'Can you help me with something?', 'Of course, what do you need?',
    'That sounds great!', 'Let me know when you\'re free',
    'I love your photos!', 'Thanks so much! 😊',
    'Are you going to the party?', 'Yes, I\'ll be there!',
  ];

  for (const [u1, u2] of convPairs) {
    const conv = await Conversation.create() as any;
    await (conv as any).setParticipants([u1.id, u2.id]);

    const numMessages = 3 + Math.floor(Math.random() * 5);
    for (let m = 0; m < numMessages; m++) {
      const sender = m % 2 === 0 ? u1 : u2;
      const text = messageTexts[(m + conv.id) % messageTexts.length];
      const msg = await Message.create({
        conversationId: conv.id,
        senderId: sender.id,
        text,
        isRead: true,
      } as any);

      // Set last read status
      if (m === numMessages - 1) {
        const receiver = m % 2 === 0 ? u2 : u1;
        await ConversationReadStatus.upsert({
          conversationId: conv.id,
          userId: receiver.id,
          lastReadMessageId: msg.id,
        } as any);
      }
    }
  }
  console.log('Created conversations');

  // Add notifications
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < 3; j++) {
      const fromUser = users[(i + j + 1) % users.length];
      const post = posts[(i + j) % posts.length];
      await Notification.create({
        userId: users[i].id,
        type: ['post_like', 'post_comment', 'friend_request'][j % 3],
        title: ['Post Liked', 'New Comment', 'Friend Request'][j % 3],
        body: j % 3 === 0 ? `${fromUser.firstName} liked your post` :
              j % 3 === 1 ? `${fromUser.firstName} commented on your post` :
              `${fromUser.firstName} sent you a friend request`,
        actorId: fromUser.id,
        postId: j % 3 !== 2 ? post.id : undefined,
        isRead: j < 1,
      } as any);
    }
  }
  console.log('Created notifications');

  console.log('\n✅ Seed complete!');
  console.log('Users (password: testpass123):');
  users.forEach(u => console.log(`  - ${u.email} (${u.firstName} ${u.lastName})`));
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
