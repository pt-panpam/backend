import { sequelize } from './config/database';
import { initModels, User, Post, PostPhoto, PostLike, SavedPost, Comment, Friend, FriendRequest, Conversation, Message, ConversationReadStatus, Notification, Hobby, CrossEvent, CrossSettings, ProfileGallery, ProfileLike, Block, Call, Report, Recap } from './models';
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
    'Hiking', 'Yoga', 'Cycling', 'Movies', 'Fashion', 'Coding', 'Design', 'Chess',
  ];
  const hobbies = await Hobby.bulkCreate(hobbyData.map(name => ({ name } as any)));
  console.log(`Created ${hobbies.length} hobbies`);

  const ONBOARDING_USER_COUNT = 10;

  // Create users with FULL onboarding data
  const usersData = [
    {
      email: 'alice@test.com', username: 'alice', firstName: 'Alice', lastName: 'Johnson',
      bio: 'Love photography and nature 🌿 Love exploring new places and capturing moments through my lens.',
      location: 'New York, USA', latitude: 40.7128, longitude: -74.0060,
      profilePicture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
      sex: 'female', dateOfBirth: '1995-03-15', lookingFor: 'male',
      hobbies: ['Photography', 'Travel', 'Hiking', 'Yoga', 'Reading'],
      onboardingComplete: true,
    },
    {
      email: 'bob@test.com', username: 'bob', firstName: 'Bob', lastName: 'Smith',
      bio: 'Software developer & coffee lover ☕ Building cool stuff and always learning something new.',
      location: 'San Francisco, USA', latitude: 37.7749, longitude: -122.4194,
      profilePicture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
      sex: 'male', dateOfBirth: '1993-07-22', lookingFor: 'female',
      hobbies: ['Coding', 'Gaming', 'Music', 'Fitness', 'Reading'],
      onboardingComplete: true,
    },
    {
      email: 'charlie@test.com', username: 'charlie', firstName: 'Charlie', lastName: 'Brown',
      bio: 'Music is life 🎵 Guitarist, singer, and music producer. Always jamming to something.',
      location: 'Chicago, USA', latitude: 41.8781, longitude: -87.6298,
      profilePicture: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop',
      sex: 'male', dateOfBirth: '1997-11-08', lookingFor: 'everyone',
      hobbies: ['Music', 'Dancing', 'Movies', 'Art', 'Cooking'],
      onboardingComplete: true,
    },
    {
      email: 'diana@test.com', username: 'diana', firstName: 'Diana', lastName: 'Prince',
      bio: 'Adventure seeker 🏔️ Rock climber, scuba diver, and all-around outdoor enthusiast.',
      location: 'Los Angeles, USA', latitude: 34.0522, longitude: -118.2437,
      profilePicture: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop',
      sex: 'female', dateOfBirth: '1994-05-30', lookingFor: 'male',
      hobbies: ['Hiking', 'Swimming', 'Travel', 'Fitness', 'Cycling'],
      onboardingComplete: true,
    },
    {
      email: 'eve@test.com', username: 'eve', firstName: 'Eve', lastName: 'Chen',
      bio: 'Foodie & traveler ✈️ Exploring the world one dish at a time. Currently on a mission to try every cuisine.',
      location: 'Seattle, USA', latitude: 47.6062, longitude: -122.3321,
      profilePicture: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop',
      sex: 'female', dateOfBirth: '1996-09-12', lookingFor: 'everyone',
      hobbies: ['Cooking', 'Travel', 'Photography', 'Yoga', 'Fashion'],
      onboardingComplete: true,
    },
    {
      email: 'frank@test.com', username: 'frank', firstName: 'Frank', lastName: 'Wilson',
      bio: 'Fitness enthusiast 💪 Personal trainer and nutrition coach. Let\'s get those gains!',
      location: 'Miami, USA', latitude: 25.7617, longitude: -80.1918,
      profilePicture: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop',
      sex: 'male', dateOfBirth: '1992-01-25', lookingFor: 'female',
      hobbies: ['Fitness', 'Cooking', 'Swimming', 'Cycling', 'Reading'],
      onboardingComplete: true,
    },
    {
      email: 'relohorizon@gmail.com', username: 'relohorizon', firstName: 'Relo', lastName: 'Horizon',
      bio: 'Full-stack developer & creator. Building the future one line of code at a time.',
      location: 'Remote', latitude: 37.7749, longitude: -122.4194,
      profilePicture: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop',
      sex: 'male', dateOfBirth: '1990-06-15', lookingFor: 'everyone',
      hobbies: ['Coding', 'Gaming', 'Music', 'Photography', 'Travel'],
      onboardingComplete: true,
    },
    {
      email: 'cipherdecoit@gmail.com', username: 'cipherdecoit', firstName: 'Cipher', lastName: 'Decoit',
      bio: 'Security researcher & puzzle solver. Breaking things to make them stronger.',
      location: 'Cyber City', latitude: 40.7128, longitude: -74.0060,
      profilePicture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
      sex: 'male', dateOfBirth: '1991-04-20', lookingFor: 'everyone',
      hobbies: ['Coding', 'Gaming', 'Reading', 'Chess', 'Music'],
      onboardingComplete: true,
    },
    {
      email: 'abhi@test.com', username: 'abhi', firstName: 'Abhi', lastName: 'Sharma',
      bio: 'Dev & designer 🚀 Crafting beautiful apps with modern tech stacks. Always exploring new ideas.',
      location: 'Bangalore, India', latitude: 12.9716, longitude: 77.5946,
      profilePicture: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop',
      sex: 'male', dateOfBirth: '1994-08-18', lookingFor: 'everyone',
      hobbies: ['Coding', 'Design', 'Photography', 'Travel', 'Music'],
      onboardingComplete: true,
    },
    {
      email: 'ravi@test.com', username: 'ravi', firstName: 'Ravi', lastName: 'Patel',
      bio: 'Product thinker & startup enthusiast 💡 Building products that make a difference.',
      location: 'Mumbai, India', latitude: 19.0760, longitude: 72.8777,
      profilePicture: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop',
      sex: 'male', dateOfBirth: '1992-12-05', lookingFor: 'female',
      hobbies: ['Reading', 'Travel', 'Cooking', 'Fitness', 'Movies'],
      onboardingComplete: true,
    },
    // Additional onboarding-only accounts (basic data only)
    {
      email: 'maya@test.com', username: 'maya', firstName: 'Maya', lastName: 'Rodriguez',
      bio: 'Music lover and artist 🎨',
      location: 'Austin, USA', latitude: 30.2672, longitude: -97.7431,
      profilePicture: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop',
      sex: 'female', dateOfBirth: '1998-04-10', lookingFor: 'everyone',
      hobbies: ['Music', 'Art', 'Reading'],
      onboardingComplete: true,
    },
    {
      email: 'dev@test.com', username: 'dev', firstName: 'Dev', lastName: 'Kumar',
      bio: 'Gamer and movie buff 🎮',
      location: 'London, UK', latitude: 51.5074, longitude: -0.1278,
      profilePicture: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop',
      sex: 'male', dateOfBirth: '1995-09-21', lookingFor: 'female',
      hobbies: ['Gaming', 'Music', 'Movies'],
      onboardingComplete: true,
    },
    {
      email: 'sarah@test.com', username: 'sarah', firstName: 'Sarah', lastName: 'Miller',
      bio: 'Fashion and travel enthusiast ✈️',
      location: 'Paris, France', latitude: 48.8566, longitude: 2.3522,
      profilePicture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
      sex: 'female', dateOfBirth: '1997-02-14', lookingFor: 'male',
      hobbies: ['Travel', 'Fashion', 'Cooking'],
      onboardingComplete: true,
    },
    {
      email: 'alex@test.com', username: 'alex', firstName: 'Alex', lastName: 'Chen',
      bio: 'Fitness trainer and swimmer 💪',
      location: 'Tokyo, Japan', latitude: 35.6762, longitude: 139.6503,
      profilePicture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
      sex: 'male', dateOfBirth: '1994-11-03', lookingFor: 'female',
      hobbies: ['Fitness', 'Swimming', 'Cycling'],
      onboardingComplete: true,
    },
    {
      email: 'lila@test.com', username: 'lila', firstName: 'Lila', lastName: 'Gomez',
      bio: 'Travel photographer 📸',
      location: 'Sydney, Australia', latitude: -33.8688, longitude: 151.2093,
      profilePicture: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop',
      sex: 'female', dateOfBirth: '1999-06-30', lookingFor: 'everyone',
      hobbies: ['Photography', 'Travel', 'Yoga'],
      onboardingComplete: true,
    },
  ];

  const password = await hashPassword('testpass123');
  const users = await Promise.all(usersData.map(u => User.create({
    ...u,
    password,
    isActive: true,
    isPrivate: false,
    showOnlineStatus: true,
    readReceipts: true,
    pushLikes: true,
    pushComments: true,
    pushFollows: true,
    pushMessages: true,
    pushCrosses: true,
    whoCanMessage: 'everyone',
    whoCanSeePosts: 'everyone',
    storyVisibility: 'everyone',
    friendRequestMode: 'everyone',
    theme: 'system',
    language: 'en',
    dataSaver: false,
  } as any)));
  console.log(`Created ${users.length} users with full onboarding data`);

  // Create CrossSettings for all users (default 9AM/9PM reveal)
  for (const user of users) {
    await CrossSettings.create({ userId: user.id } as any);
  }
  console.log('Created cross settings for all users');

  // Make all users friends (complete graph)
  for (let i = 0; i < ONBOARDING_USER_COUNT; i++) {
    for (let j = i + 1; j < users.length; j++) {
      await Friend.bulkCreate([
        { userId: users[i].id, friendId: users[j].id },
        { userId: users[j].id, friendId: users[i].id },
      ] as any[]);
    }
  }
  console.log('Created friendships (complete graph)');

  // Create FriendRequest records for accepted friendships
  for (let i = 0; i < ONBOARDING_USER_COUNT; i++) {
    for (let j = i + 1; j < users.length; j++) {
      await FriendRequest.create({ fromUserId: users[i].id, toUserId: users[j].id, status: 'accepted' } as any);
    }
  }
  console.log('Created friend request records');

  // Create ProfileGallery photos for each user (featured on profiles)
  const galleryPhotoSets: Record<number, string[]> = {};
  const galleryPool = [
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe49?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1518173946687-a36f968f7aef?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1504214208698-ea1916a2195a?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1504198453319-5ce911bafcde?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&h=500&fit=crop',
    'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=500&fit=crop',
  ];

  for (let i = 0; i < ONBOARDING_USER_COUNT; i++) {
    const userGallery: string[] = [];
    const numPhotos = 3 + Math.floor(Math.random() * 3); // 3-5 photos per user
    for (let g = 0; g < numPhotos; g++) {
      const imgUrl = galleryPool[(i * 5 + g) % galleryPool.length];
      await ProfileGallery.create({ userId: users[i].id, image: imgUrl, order: g } as any);
      userGallery.push(imgUrl);
    }
    galleryPhotoSets[users[i].id] = userGallery;
  }
  console.log('Created profile gallery photos for all users');

  // Create cross events for testing recap (spread across today, yesterday, DBY)
  const now = new Date();
  const crossTimes = [
    // Today - unlocked (before 9PM)
    { offset: 0, hour: 10, minute: 30, user1Idx: 0, user2Idx: 1 },
    { offset: 0, hour: 14, minute: 15, user1Idx: 0, user2Idx: 2 },
    { offset: 0, hour: 16, minute: 45, user1Idx: 1, user2Idx: 3 },
    // Today - locked (after 9PM, will unlock at 9AM tomorrow)
    { offset: 0, hour: 21, minute: 10, user1Idx: 4, user2Idx: 5 },
    { offset: 0, hour: 22, minute: 0, user1Idx: 6, user2Idx: 7 },
    // Yesterday - all unlocked
    { offset: -1, hour: 8, minute: 0, user1Idx: 0, user2Idx: 3 },
    { offset: -1, hour: 12, minute: 30, user1Idx: 1, user2Idx: 4 },
    { offset: -1, hour: 18, minute: 0, user1Idx: 2, user2Idx: 5 },
    { offset: -1, hour: 20, minute: 15, user1Idx: 3, user2Idx: 6 },
    // DBY - all unlocked
    { offset: -2, hour: 9, minute: 0, user1Idx: 0, user2Idx: 4 },
    { offset: -2, hour: 11, minute: 30, user1Idx: 1, user2Idx: 5 },
    { offset: -2, hour: 15, minute: 0, user1Idx: 2, user2Idx: 6 },
    { offset: -2, hour: 17, minute: 45, user1Idx: 3, user2Idx: 7 },
  ];

  for (const ct of crossTimes) {
    const crossDate = new Date(now);
    crossDate.setDate(crossDate.getDate() + ct.offset);
    crossDate.setHours(ct.hour, ct.minute, 0, 0);

    const u1 = users[ct.user1Idx];
    const u2 = users[ct.user2Idx];

    await CrossEvent.create({
      user1Id: Math.min(u1.id, u2.id),
      user2Id: Math.max(u1.id, u2.id),
      latitude: (u1.latitude! + u2.latitude!) / 2,
      longitude: (u1.longitude! + u2.longitude!) / 2,
      crossedAt: crossDate,
      published: true,
      notified: true,
    } as any);
  }
  console.log(`Created ${crossTimes.length} cross events for recap testing`);

  // Create posts with photos
  const postContents = [
    { caption: 'Beautiful sunset at the beach! 🏖️', location: 'Malibu Beach', lat: 34.0259, lng: -118.7798, photos: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=400&h=600&fit=crop'] },
    { caption: 'Morning coffee vibes ☕', location: 'Downtown Cafe', lat: 40.7128, lng: -74.0060, photos: ['https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefda?w=400&h=600&fit=crop'] },
    { caption: 'Hiking adventure today! 🥾', location: 'Yosemite National Park', lat: 37.8651, lng: -119.5383, photos: ['https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=600&fit=crop'] },
    { caption: 'New recipe I tried 🍳', location: 'Home Kitchen', lat: 40.7282, lng: -73.7949, photos: ['https://images.unsplash.com/photo-1551218808-94e220e084d2?w=400&h=600&fit=crop'] },
    { caption: 'Concert was amazing! 🎵', location: 'Madison Square Garden', lat: 40.7505, lng: -73.9934, photos: ['https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&h=600&fit=crop'] },
    { caption: 'City lights at night 🌃', location: 'Manhattan Skyline', lat: 40.7580, lng: -73.9855, photos: ['https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&h=600&fit=crop'] },
    { caption: 'Weekend getaway 🚗', location: 'Lake Tahoe', lat: 39.0968, lng: -120.0324, photos: ['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=600&fit=crop'] },
    { caption: 'Fresh smoothie bowl 🥣', location: 'Acai Spot', lat: 25.7617, lng: -80.1918, photos: ['https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&h=600&fit=crop'] },
    { caption: 'Art gallery exploration 🎨', location: 'MoMA', lat: 40.7614, lng: -73.9776, photos: ['https://images.unsplash.com/photo-1531913764164-f85c3e04bbf0?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1531913764164-f85c3e04bbf0?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1501084817091-a4f3d1d19e07?w=400&h=600&fit=crop'] },
    { caption: 'Beach day! 🌊', location: 'Santa Monica', lat: 34.0095, lng: -118.4973, photos: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=600&fit=crop'] },
    { caption: 'Late night coding session 💻', location: 'Home Office', lat: 37.7749, lng: -122.4194, photos: ['https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=400&h=600&fit=crop'] },
    { caption: 'Farmers market finds 🥬', location: 'Union Square Market', lat: 40.7359, lng: -73.9911, photos: ['https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=400&h=600&fit=crop'] },
    { caption: 'Yoga at sunrise 🧘', location: 'Rooftop Studio', lat: 40.7484, lng: -73.9967, photos: ['https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&h=600&fit=crop'] },
    { caption: 'New bookstore discovery 📚', location: 'The Strand', lat: 40.7527, lng: -73.9906, photos: ['https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=400&h=600&fit=crop'] },
    { caption: 'Street photography session 📸', location: 'Brooklyn Bridge', lat: 40.7061, lng: -73.9969, photos: ['https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=600&fit=crop'] },
    { caption: 'Garden bloom 🌸', location: 'Botanical Garden', lat: 40.8624, lng: -73.8838, photos: ['https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=400&h=600&fit=crop', 'https://images.unsplash.com/photo-1496062031456-07b8f162a322?w=400&h=600&fit=crop'] },
    { caption: 'Film night 🎬', location: 'Home Theater', lat: 34.0522, lng: -118.2437, photos: ['https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=600&fit=crop'] },
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

  // Add notifications including cross_recap
  for (let i = 0; i < ONBOARDING_USER_COUNT; i++) {
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

    // Add cross_recap notification for each user
    await Notification.create({
      userId: users[i].id,
      type: 'cross_recap',
      title: 'New Crosses Revealed',
      body: `Your daily recap for ${now.toISOString().split('T')[0]} is ready!`,
      actorId: users[i].id,
      isRead: false,
    } as any);
  }
  console.log('Created notifications with cross_recap');

  // ── Saved Posts ──────────────────────────────────────────────
  for (const post of posts) {
    const savers = users.filter(u => u.id !== post.userId).slice(0, 1 + Math.floor(Math.random() * 2));
    for (const saver of savers) {
      await SavedPost.findOrCreate({
        where: { userId: saver.id, postId: post.id } as any,
        defaults: { userId: saver.id, postId: post.id } as any,
      });
    }
  }
  console.log('Created saved posts');

  // ── Profile Likes ────────────────────────────────────────────
  for (const user of users) {
    const likers = users.filter(u => u.id !== user.id).slice(0, 2 + Math.floor(Math.random() * 3));
    for (const liker of likers) {
      await ProfileLike.findOrCreate({
        where: { userId: liker.id, likedUserId: user.id } as any,
        defaults: { userId: liker.id, likedUserId: user.id } as any,
      });
    }
  }
  console.log('Created profile likes');

  // ── Blocks ───────────────────────────────────────────────────
  // Block user[7] from user[0] and user[6] from user[1] for testing
  await Block.findOrCreate({
    where: { blockerId: users[0].id, blockedId: users[7].id } as any,
    defaults: { blockerId: users[0].id, blockedId: users[7].id } as any,
  });
  await Block.findOrCreate({
    where: { blockerId: users[1].id, blockedId: users[6].id } as any,
    defaults: { blockerId: users[1].id, blockedId: users[6].id } as any,
  });
  console.log('Created blocks');

  // ── Calls ────────────────────────────────────────────────────
  const callTypes: ('audio' | 'video')[] = ['audio', 'video'];
  const callStatuses: ('missed' | 'answered' | 'rejected')[] = ['missed', 'answered', 'rejected'];
  for (let i = 0; i < 6; i++) {
    const caller = users[i % users.length];
    const callee = users[(i + 2) % users.length];
    const callDate = new Date(now);
    callDate.setHours(callDate.getHours() - (i + 1) * 2);
    // Find a conversation between these two users
    const conv = await Conversation.findOne({
      include: [{
        association: 'participants',
        where: { id: [caller.id, callee.id] },
      }],
    });
    await Call.create({
      conversationId: conv?.id || 1,
      callerId: caller.id,
      calleeId: callee.id,
      callType: callTypes[i % 2],
      status: callStatuses[i % 3],
      startedAt: callDate,
      endedAt: callStatuses[i % 3] === 'answered' ? new Date(callDate.getTime() + 300000) : null,
      duration: callStatuses[i % 3] === 'answered' ? 300 : null,
    } as any);
  }
  console.log('Created call logs');

  // ── Reports ──────────────────────────────────────────────────
  const reportReasons = ['spam', 'inappropriate', 'harassment', 'fake_account'];
  for (let i = 0; i < 3; i++) {
    const reporter = users[i];
    const reported = users[(i + 3) % users.length];
    const targetPost = posts[i % posts.length];
    await Report.create({
      reporterId: reporter.id,
      reportedUserId: reported.id,
      postId: targetPost.id,
      reason: reportReasons[i % reportReasons.length],
      description: `This content appears to be ${reportReasons[i % reportReasons.length]}.`,
      status: 'pending',
    } as any);
  }
  console.log('Created reports');

  // ── Recaps ───────────────────────────────────────────────────
  // Create recaps for the last 3 days for each user
  for (const user of users) {
    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      const recapDate = new Date(now);
      recapDate.setDate(recapDate.getDate() - dayOffset);
      recapDate.setHours(21, 0, 0, 0); // 9PM recap

      // Find crosses for this user on this day
      const dayStart = new Date(recapDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(recapDate);
      dayEnd.setHours(23, 59, 59, 999);

      const userCrosses = await CrossEvent.findAll({
        where: {
          [require('sequelize').Op.or]: [
            { user1Id: user.id },
            { user2Id: user.id },
          ],
          crossedAt: { [require('sequelize').Op.between]: [dayStart, dayEnd] },
        } as any,
      });

      if (userCrosses.length > 0) {
        const dateStr = recapDate.toISOString().split('T')[0]; // "2026-06-29"
        const period = recapDate.getHours() < 12 ? 'am' : 'pm';
        await Recap.create({
          userId: user.id,
          date: dateStr,
          period,
          total: userCrosses.length,
        } as any);
      }
    }
  }
  console.log('Created recaps');

  console.log('\n✅ Seed complete!');
  console.log('Users (password: testpass123):');
  users.forEach(u => console.log(`  - ${u.email} (${u.firstName} ${u.lastName})`));
  console.log('\nCross events created for recap testing:');
  console.log('  - Today: 4 crosses (2 unlocked, 2 locked until 9AM tomorrow)');
  console.log('  - Yesterday: 4 crosses (all unlocked)');
  console.log('  - DBY: 4 crosses (all unlocked)');
  console.log('\nEach user has a cross_recap notification ready to test!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});