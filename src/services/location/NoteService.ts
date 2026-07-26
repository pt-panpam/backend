import { Op } from 'sequelize';
import { Note } from '../../models/Note';
import { NoteVote } from '../../models/NoteVote';
import { createAndDeliverNotification } from '../NotificationService';
import { H3Service } from './H3Service';

const EARTH_RADIUS_M = 6_371_000;

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class NoteService {
  static getInstance(): NoteService {
    return new NoteService();
  }

  async dropNote(
    userId: number,
    text: string,
    latitude: number,
    longitude: number,
    discoveryRadiusM = 50,
  ): Promise<Note> {
    const now = new Date();
    const publishedAt = new Date(now.getTime() + 30 * 60 * 1000);
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return Note.create({
      userId,
      text,
      latitude,
      longitude,
      discoveryRadiusM,
      publishedAt,
      expiresAt,
      upvoteCount: 0,
    });
  }

  async getNearbyNotes(
    lat: number,
    lng: number,
    radiusM = 50,
  ): Promise<Note[]> {
    const now = new Date();
    const userHex = H3Service.latLngToHex(lat, lng);

    const allPublished = await Note.findAll({
      where: {
        publishedAt: { [Op.lte]: now },
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: now } },
        ],
      },
      attributes: ['id', 'text', 'latitude', 'longitude', 'discoveryRadiusM', 'publishedAt', 'expiresAt', 'upvoteCount', 'created_at'],
      order: [['created_at', 'DESC']],
    });

    return allPublished.filter((note) => {
      const noteHex = H3Service.latLngToHex(note.latitude, note.longitude);
      if (noteHex !== userHex) return false;
      const dist = haversineDistance(lat, lng, note.latitude, note.longitude);
      return dist <= Math.min(radiusM, note.discoveryRadiusM);
    });
  }

  async getMyNotes(userId: number): Promise<Note[]> {
    const now = new Date();
    return Note.findAll({
      where: {
        userId,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: now } },
        ],
      },
      order: [['created_at', 'DESC']],
    });
  }

  async upvoteNote(noteId: number, userId: number): Promise<{ note: Note; alreadyVoted: boolean }> {
    const existing = await NoteVote.findOne({ where: { noteId, userId } });
    if (existing) {
      const note = await Note.findByPk(noteId);
      return { note: note!, alreadyVoted: true };
    }

    const note = await Note.findByPk(noteId);
    if (!note) throw new Error('Note not found');

    if (note.userId === userId) throw new Error('Cannot upvote own note');

    await NoteVote.create({ noteId, userId });
    note.upvoteCount += 1;
    await note.save();

    await createAndDeliverNotification({
      type: 'note_upvote',
      userId: note.userId,
      title: 'New Upvote',
      body: 'Someone upvoted your note',
      actorId: userId,
    });

    return { note, alreadyVoted: false };
  }

  async publishOverdueNotes(): Promise<number> {
    const now = new Date();
    const [count] = await Note.update(
      { publishedAt: now },
      { where: { publishedAt: { [Op.gt]: now } } },
    );
    return count;
  }

  async getNoteById(noteId: number): Promise<Note | null> {
    return Note.findByPk(noteId, {
      attributes: ['id', 'text', 'latitude', 'longitude', 'discoveryRadiusM', 'publishedAt', 'upvoteCount', 'created_at'],
    });
  }
}
