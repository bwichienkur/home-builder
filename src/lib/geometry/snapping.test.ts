import { describe, expect, it } from 'vitest';
import type { Wall } from '../../types';
import { snapWallPoint } from './snapping';

const wall:Wall={id:'existing',start:{x:100,y:100},end:{x:300,y:100},height:2.7,thickness:.15};

describe('snapWallPoint',()=>{
 it('magnetically connects to a nearby wall endpoint',()=>{
  expect(snapWallPoint({x:128,y:116},[wall])).toEqual({x:100,y:100});
 });

 it('snaps to the grid when no wall endpoint is nearby',()=>{
  expect(snapWallPoint({x:171,y:169},[wall])).toEqual({x:180,y:160});
 });

 it('does not snap a resized wall to its own opposite endpoint',()=>{
  expect(snapWallPoint({x:285,y:110},[wall],'existing')).toEqual({x:280,y:120});
 });
});
