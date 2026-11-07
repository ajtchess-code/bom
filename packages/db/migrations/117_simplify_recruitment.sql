-- Recruitment is now Review -> Interview -> Decision.
-- Fold applications sitting in the retired stages into the remaining ones.
UPDATE recruitment_applications SET status='RECRUITER_REVIEW',updated_at=now()
 WHERE status IN ('VERIFICATION','WAITING_ON_APPLICANT','ON_HOLD');
-- Trials are retired: anyone mid-trial or in final review now awaits the leadership decision.
UPDATE recruitment_applications SET status='INTERVIEW',waiting_on='LEADERSHIP',current_request='Awaiting the final decision',updated_at=now()
 WHERE status IN ('TRIAL','FINAL_REVIEW');
UPDATE recruitment_applications SET waiting_on='RECRUITER' WHERE waiting_on='TRIAL';
-- Saved recruiter responses that moved applications into a retired stage.
UPDATE recruitment_canned_responses SET set_status='RECRUITER_REVIEW' WHERE set_status IN ('VERIFICATION','WAITING_ON_APPLICANT','ON_HOLD');
UPDATE recruitment_canned_responses SET set_status=NULL,set_waiting_on=NULL WHERE set_status IN ('TRIAL','FINAL_REVIEW') OR set_waiting_on='TRIAL';
UPDATE recruitment_canned_responses SET enabled=false WHERE name='Trial check-in' AND category='TRIAL';
