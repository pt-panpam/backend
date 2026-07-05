import { sequelize } from './config/database';
import { initModels, User, CrossSettings } from './models';
import { hashPassword } from './utils/helpers';

async function createAccounts() {
  await sequelize.authenticate();
  initModels(sequelize);
  // sync without force — won't drop existing data
  await sequelize.sync();

  const password = await hashPassword('testpass123');

  const usersData = [
    {
      email: 'user1@test.com',
      username: 'userone',
      firstName: 'User',
      lastName: 'One',
      password,
      bio: 'First test account.',
      location: 'New York, USA',
      latitude: 40.7128,
      longitude: -74.0060,
      sex: 'female',
      dateOfBirth: '1995-03-15',
      lookingFor: 'male',
      hobbies: ['Photography', 'Travel', 'Reading'],
      onboardingComplete: true,
      isActive: true,
    },
    {
      email: 'user2@test.com',
      username: 'usertwo',
      firstName: 'User',
      lastName: 'Two',
      password,
      bio: 'Second test account.',
      location: 'San Francisco, USA',
      latitude: 37.7749,
      longitude: -122.4194,
      sex: 'male',
      dateOfBirth: '1993-07-22',
      lookingFor: 'female',
      hobbies: ['Coding', 'Gaming', 'Music'],
      onboardingComplete: true,
      isActive: true,
    },
  ];

  for (const data of usersData) {
    const [user, created] = await User.findOrCreate({
      where: { email: data.email },
      defaults: data as any,
    });
    if (created) {
      await CrossSettings.create({ userId: user.id } as any);
      console.log(`Created: ${user.email} (id: ${user.id})`);
    } else {
      console.log(`Already exists: ${user.email}`);
    }
  }

  await sequelize.close();
  console.log('Done.');
}

createAccounts().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
