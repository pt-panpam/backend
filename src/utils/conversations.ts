import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Conversation } from '../models/Conversation';

export async function findOneToOneConversation(userId: number, otherUserId: number) {
  const rows = await sequelize.query<{ id: number }>(
    `SELECT cp1.conversation_id AS id
     FROM conversation_participants cp1
     JOIN conversation_participants cp2
       ON cp1.conversation_id = cp2.conversation_id
     WHERE cp1.user_id = :userId AND cp2.user_id = :otherUserId
       AND (SELECT COUNT(*) FROM conversation_participants cp3
            WHERE cp3.conversation_id = cp1.conversation_id) = 2
     LIMIT 1`,
    { replacements: { userId, otherUserId }, type: QueryTypes.SELECT }
  );
  return rows[0] ? Conversation.findByPk(rows[0].id) : null;
}
