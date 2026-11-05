import numpy as np
import pytest
import supervision as sv
from test_operations import floor,make_ready,observation
from app.operations import OperationError


def test_cleaning_task_assignment_and_completion_respects_readiness(floor):
    floor.action('T1','hold_occupied');floor.action('T1','depart')
    task=next(t for t in floor.state['tasks'] if t['kind']=='cleaning')
    floor.update_task(task['id'],'assign','cleaner-1')
    floor.update_task(task['id'],'acknowledge');floor.update_task(task['id'],'start')
    floor.fresh=False
    with pytest.raises(OperationError):floor.update_task(task['id'],'complete')
    floor.fresh=True;floor.update_task(task['id'],'complete')
    assert task['status']=='completed' and floor.table('T1')['status']=='ready'
    assert task['assigned_to']=='cleaner-1'


def test_service_gap_suggestion_and_recorded_visit(floor):
    floor.action('T1','hold_occupied')
    floor.state['policy']['check_in_minutes']=1
    floor.observe('demo',[observation('T1','AVAILABLE')],61)
    task=next(t for t in floor.state['tasks'] if t['kind']=='check_in')
    assert task['source']=='heuristic' and 'intent is unknown' in task['note']
    floor.update_task(task['id'],'complete')
    floor.observe('demo',[observation('T1','AVAILABLE')],100)
    assert not [t for t in floor.state['tasks'] if t['status']=='open']
    floor.observe('demo',[observation('T1','AVAILABLE')],122)
    assert len([t for t in floor.state['tasks'] if t['kind']=='check_in'])==2


def test_role_assignment_and_duplicate_requests(floor):
    floor.action('T1','hold_occupied');floor.request_service('T1','Water requested')
    floor.request_service('T1','Water requested again')
    task=next(t for t in floor.state['tasks'] if t['kind']=='service')
    assert len(floor.state['tasks'])==1
    with pytest.raises(OperationError):floor.update_task(task['id'],'assign','cleaner-1')
    floor.add_staff('Alex','waiter');floor.update_task(task['id'],'assign',floor.state['staff'][-1]['id'])
    floor.update_task(task['id'],'complete')
    with pytest.raises(OperationError):floor.update_task(task['id'],'complete')


def person(x,track=1):
    return sv.Detections(xyxy=np.array([[x-5,0,x+5,10]],dtype=float),tracker_id=np.array([track]))


def test_entrance_crossing_requires_host_confirmation_and_deduplicates(floor):
    region=[(20,0),(50,0),(50,20),(20,20)]
    floor.observe_entrance(person(10),region,0)
    floor.observe_entrance(person(30),region,1)
    floor.observe_entrance(person(30),region,2)
    assert len(floor.state['arrivals'])==1 and floor.state['parties']==[]
    floor.observe_entrance(person(10,2),region,2)
    floor.observe_entrance(person(30,2),region,3)
    candidate=floor.state['arrivals'][0]
    assert candidate['observed_people']==2
    floor.resolve_arrival(candidate['id'],'register','Guests',4)
    assert floor.state['parties'][0]['size']==4 and candidate['status']=='registered'
    with pytest.raises(OperationError):floor.resolve_arrival(candidate['id'],'register',size=2)


def test_initial_person_inside_is_not_an_arrival(floor):
    floor.observe_entrance(person(30),[(20,0),(50,0),(50,20),(20,20)],0)
    assert floor.state['arrivals']==[]


def test_analytics_archive_and_assumptions_persist_on_restart(floor):
    make_ready(floor)
    party=floor.add_party('Pair',2);floor.state['now']=120
    floor.seat(party['id'],'T1',floor.state['version'])
    floor.state['now']=180;floor.action('T1','depart')
    summary=floor.operational_analytics()
    assert summary['average_wait_minutes']==2 and summary['guests_seated']==2
    assert summary['completed_sessions'][0]['duration_seconds']==60
    floor.set_assumptions(dict(dining_min=10,dining_max=20,cleaning_min=1,cleaning_max=3))
    floor.configure('new',[],reset=True)
    assert floor.state['assumptions']['dining_min']==10
    assert len(floor.operational_analytics()['history'])==1
