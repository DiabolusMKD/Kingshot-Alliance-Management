'use client';

import { supabase } from './supabaseClient';
import { AllianceEvent } from '@/types';

/**
 * Create a new alliance event
 */
export async function createAllianceEvent(event: Omit<AllianceEvent, 'id' | 'createdAt' | 'updatedAt'>) {
  try {
    const { data, error } = await supabase
      .from('alliance_event')
      .insert([event])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating alliance event:', error);
    throw error;
  }
}

/**
 * Get alliance events by alliance ID and event ID
 */
export async function getAllianceEvents(allianceId: number, eventId: number) {
  try {
    const { data, error } = await supabase
      .from('alliance_event')
      // + number of assigned players (event_player rows)
      .select('*, event_player(count)')
      .eq('allianceId', allianceId)
      .eq('eventId', eventId)
      .order('createdAt', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching alliance events:', error);
    throw error;
  }
}

/**
 * Get a single alliance event by ID
 */
export async function getAllianceEventById(id: number) {
  try {
    const { data, error } = await supabase
      .from('alliance_event')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  } catch (error) {
    console.error('Error fetching alliance event:', error);
    throw error;
  }
}

/**
 * Update alliance event
 */
export async function updateAllianceEvent(
  id: number,
  updates: Partial<AllianceEvent>
) {
  try {
    const { data, error } = await supabase
      .from('alliance_event')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating alliance event:', error);
    throw error;
  }
}

/**
 * Delete alliance event
 */
export async function deleteAllianceEvent(id: number) {
  try {
    const { error } = await supabase
      .from('alliance_event')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting alliance event:', error);
    throw error;
  }
}
