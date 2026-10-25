import assert from 'node:assert/strict';
import {test} from 'node:test';
import {channelHref,matchesFlowChannel,selectedChannel} from './channel-context';
test('channel context survives feature navigation while unrestricted legacy bots remain visible',()=>{
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(selectedChannel('?channelId='+id),id);assert.equal(selectedChannel('?channelId=bad'), '');
 assert.equal(matchesFlowChannel([],id),true);assert.equal(matchesFlowChannel([id],id),true);assert.equal(matchesFlowChannel(['other'],id),false);
 const url=channelHref('/dashboard/crm?q=travel',id);assert.equal(selectedChannel(url.split('?')[1]),id);assert.equal(new URLSearchParams(url.split('?')[1]).get('q'),'travel');assert.equal(channelHref(url,''),'/dashboard/crm?q=travel');
});
