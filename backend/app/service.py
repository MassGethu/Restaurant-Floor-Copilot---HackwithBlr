"""Staff work, arrival candidates, and auditable service-gap suggestions."""
import copy
import json
import uuid


class ServiceMixin:
    def ensure_task(self, table_id, kind, source, note):
        for task in self.state['tasks']:
            if task['table_id'] == table_id and task['kind'] == kind and task['status'] in ('open', 'acknowledged', 'in_progress'):
                return task
        task = dict(id=str(uuid.uuid4()), table_id=table_id, kind=kind, source=source, note=note,
                    role='cleaner' if kind == 'cleaning' else 'waiter', status='open', assigned_to=None,
                    created_at=self.state['now'], acknowledged_at=None, completed_at=None)
        self.state['tasks'].append(task)
        self.event(f"{self.table(table_id)['name']}: {kind.replace('_',' ')} task opened. {note}", source)
        return task

    def reconcile_tasks(self):
        changed = False
        now = self.state['now']
        table_ids={t['id'] for t in self.state['tables']}
        for task in self.state['tasks']:
            if task['table_id'] not in table_ids and task['status'] in ('open','acknowledged','in_progress'):
                task.update(status='cancelled',completed_at=now,note='Table region removed.');changed=True
        for table in self.state['tables']:
            active = [t for t in self.state['tasks'] if t['table_id'] == table['id'] and t['status'] in ('open','acknowledged','in_progress')]
            if table['status'] == 'cleaning_required' and not any(t['kind']=='cleaning' for t in active):
                self.ensure_task(table['id'], 'cleaning', table.get('dirty_origin','system'), 'Vacated table requires staff cleaning confirmation.')
                changed = True
            for task in active:
                if task['kind']=='cleaning' and table['status'] == 'ready':
                    task.update(status='completed', completed_at=now); changed = True
                elif task['kind']=='cleaning' and table['status']=='occupied':
                    task.update(status='cancelled', completed_at=now, note='Table occupied again; verify cleaning with staff.'); changed=True
                elif task['kind'] in ('check_in','service') and table['status'] not in ('occupied','needs_verification'):
                    task.update(status='cancelled', completed_at=now);changed=True
            if table['status']=='occupied' and table['occupied_since'] is not None:
                last = max(table['occupied_since'], table.get('last_service_at') or table['occupied_since'],table.get('last_attention_review_at') or table['occupied_since'])
                if now-last >= self.state['policy']['check_in_minutes']*60 and not any(t['kind'] in ('check_in','service') for t in active):
                    self.ensure_task(table['id'],'check_in','heuristic', f"No staff visit recorded for {int((now-last)/60)} minutes. Check-in suggested; customer intent is unknown.")
                    changed=True
        return changed

    def request_service(self, table_id, note='Customer assistance requested by staff'):
        with self.lock:
            table=self.table(table_id)
            if table['status'] not in ('occupied','needs_verification'):
                self.fail('Service requests require an occupied or unverified table.')
            check_in=next((t for t in self.state['tasks'] if t['table_id']==table_id and t['kind']=='check_in' and t['status'] in ('open','acknowledged','in_progress')),None)
            if check_in:check_in.update(kind='service',source='staff',note=note.strip()[:240] or 'Staff requested service.')
            else:self.ensure_task(table_id,'service','staff',note.strip()[:240] or 'Staff requested a service visit.')
            self.save()

    def update_task(self, task_id, action, staff_id=None):
        with self.lock:
            task=next((t for t in self.state['tasks'] if t['id']==task_id),None)
            if task is None:self.fail('Task not found.')
            if task['status'] in ('completed','cancelled'):self.fail('This task is already closed.')
            if action=='assign':
                person=next((p for p in self.state['staff'] if p['id']==staff_id),None)
                if person is None or person['role'] != task['role']:self.fail('Choose a staff member with the matching role.')
                task['assigned_to']=person['id']
            elif action=='acknowledge':
                task.update(status='acknowledged',acknowledged_at=self.state['now'])
            elif action=='start':
                task.update(status='in_progress',acknowledged_at=task['acknowledged_at'] or self.state['now'])
            elif action=='complete':
                if task['kind']=='cleaning':
                    self.action(task['table_id'],'clean')
                    return
                table=self.table(task['table_id'])
                table['last_service_at']=self.state['now']
                task.update(status='completed',completed_at=self.state['now'])
            elif action=='cancel':
                if task['kind']=='cleaning':self.fail('Confirm cleaning or reassign this task; a dirty table still needs preparation.')
                self.table(task['table_id'])['last_attention_review_at']=self.state['now']
                task.update(status='cancelled',completed_at=self.state['now'])
            else:self.fail('Unknown task action.')
            self.event(f"{self.table(task['table_id'])['name']}: task {action}.",'staff')
            self.save()

    def add_staff(self,name,role):
        with self.lock:
            if role not in ('waiter','cleaner','host') or not name.strip():self.fail('A name and valid staff role are required.')
            if len(self.state['staff'])>=30:self.fail('Staff roster is full.')
            self.state['staff'].append(dict(id=str(uuid.uuid4()),name=name.strip()[:60],role=role))
            self.save()

    def observe_entrance(self, detections, polygon, now):
        """Track-ID transitions into a configured entrance region; no identity inference."""
        if not polygon:return
        import cv2
        import numpy as np
        contour=np.array(polygon,dtype=np.float32)
        ids=detections.tracker_id
        if ids is None:return
        with self.lock:
            for box,track in zip(detections.xyxy,ids):
                if int(track)<0:continue
                key=str(int(track))
                inside=cv2.pointPolygonTest(contour,(float((box[0]+box[2])/2),float(box[3])),False)>=0
                old=self._entrance_tracks.get(key)
                self._entrance_tracks[key]=dict(inside=inside,last_at=now)
                if not inside or old is None or old['inside']:continue
                if now-self._arrival_cooldowns.get(key,-10000)<120:continue
                self._arrival_cooldowns[key]=now
                candidate=next((a for a in reversed(self.state['arrivals']) if a['status']=='pending' and now-a['observed_at']<=5),None)
                if candidate:
                    candidate['observed_people']+=1
                else:
                    self.state['arrivals'].append(dict(id=str(uuid.uuid4()),observed_at=now,observed_people=1,status='pending',party_id=None,
                        note='Tracked person entered the configured entrance region. Host must confirm party size; staff and passers-by may be included.'))
                self.event('Entrance crossing observed. Host review required.','vision')
                self.save()
            self._entrance_tracks={key:value for key,value in self._entrance_tracks.items() if now-value['last_at']<120}

    def resolve_arrival(self,arrival_id,action,name='',size=1):
        with self.lock:
            arrival=next((a for a in self.state['arrivals'] if a['id']==arrival_id),None)
            if arrival is None or arrival['status']!='pending':self.fail('Arrival candidate is no longer pending.')
            if action=='dismiss':arrival['status']='dismissed'
            elif action=='register':
                party=self.add_party(name,size)
                arrival.update(status='registered',party_id=party['id'])
            else:self.fail('Unknown arrival action.')
            self.save()

    def availability(self):
        now=self.state['now'];a=self.state['assumptions'];result=[]
        for table in self.state['tables']:
            low=high=None;reason='Staff verification or a manual estimate is required.'
            if table['status']=='ready':low=high=0;reason='Staff-confirmed ready; visual freshness and capacity still apply.'
            elif table['status']=='cleaning_required':low=a['cleaning_min'];high=a['cleaning_max'];reason='Assumes staff begin cleaning now; completion must be confirmed.'
            elif table['status']=='occupied' and table['duration_known']:
                elapsed=(now-table['occupied_since'])/60
                if elapsed<a['dining_max']:
                    low=max(0,a['dining_min']-elapsed)+a['cleaning_min'];high=max(0,a['dining_max']-elapsed)+a['cleaning_max']
                    reason='Dining-duration assumption plus cleaning; not a learned departure prediction.'
                else:reason='Dining session exceeds the assumed range. Ask staff for an updated estimate.'
            result.append(dict(table_id=table['id'],name=table['name'],capacity=table['capacity'],min_minutes=low,max_minutes=high,reason=reason))
        return sorted(result,key=lambda t:(t['max_minutes'] is None,t['max_minutes'] or 0,t['capacity']))

    def operational_analytics(self):
        waiting=[p for p in self.state['parties'] if p['status']=='waiting']
        served=[p for p in self.state['parties'] if p.get('seated_at') is not None]
        sessions=self.state['completed_sessions']
        total_capacity=sum(t['capacity'] for t in self.state['tables'])
        return dict(parties_seated=len(served),guests_seated=sum(p['size'] for p in served),
            average_wait_minutes=sum((p['seated_at']-p['arrived_at'])/60 for p in served)/len(served) if served else None,
            longest_wait_minutes=max(((self.state['now']-p['arrived_at'])/60 for p in waiting),default=0),
            total_capacity=total_capacity,occupied_capacity=sum(t['capacity'] for t in self.state['tables'] if t['status']=='occupied'),
            completed_sessions=copy.deepcopy(sessions),trend=copy.deepcopy(self.state['trend']),
            tasks_completed=sum(t['status']=='completed' for t in self.state['tasks']),
            manual_overrides=self.state['counters']['manager_overrides'],
            history=[json.loads(json_row[0]) for json_row in self.db.execute('SELECT payload FROM floor_sessions ORDER BY rowid DESC LIMIT 30')])
