"""Chapter2 schema squash (#378)

Single migration replacing the ~50 chapter2 revisions that followed deploy head
e4a7b2d918f3. None of them ran on a deployed database. Local databases created
from the old chain must be reset (dropdb/createdb + alembic upgrade head).

Revision ID: c2a0f1e5d7b3
Revises: e4a7b2d918f3
Create Date: 2026-09-30 01:52:19.913298

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2a0f1e5d7b3'
down_revision: Union[str, None] = 'e4a7b2d918f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('discovered_listings',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('content_sha256', sa.String(length=64), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('company', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('location', sa.String(length=200), nullable=True),
    sa.Column('remote', sa.Boolean(), nullable=True),
    sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('apply_url', sa.String(length=2048), nullable=True),
    sa.Column('department', sa.String(length=200), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_discovered_listings_content_sha256'), 'discovered_listings', ['content_sha256'], unique=True)
    op.create_table('discovery_sources',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('source_key', sa.String(length=100), nullable=False),
    sa.Column('display_name', sa.String(length=160), nullable=False),
    sa.Column('source_family', sa.String(length=40), nullable=False),
    sa.Column('owner', sa.String(length=160), nullable=False),
    sa.Column('terms_status', sa.String(length=20), server_default='pending', nullable=False),
    sa.Column('terms_reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('terms_reviewed_by', sa.String(length=160), nullable=True),
    sa.Column('allowed_behavior', sa.String(length=40), nullable=False),
    sa.Column('endpoint_url', sa.String(length=2048), nullable=True),
    sa.Column('rate_limit_per_minute', sa.Integer(), nullable=False),
    sa.Column('attribution_rule', sa.Text(), nullable=False),
    sa.Column('retention_days', sa.Integer(), nullable=False),
    sa.Column('kill_switch', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('last_fetched_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_outcome', sa.String(length=200), nullable=True),
    sa.Column('listing_count', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("(terms_status = 'pending' AND terms_reviewed_at IS NULL AND terms_reviewed_by IS NULL) OR (terms_status IN ('accepted', 'failed') AND terms_reviewed_at IS NOT NULL AND terms_reviewed_by IS NOT NULL)", name='ck_discovery_sources_terms_review_record'),
    sa.CheckConstraint("allowed_behavior IN ('api', 'feed', 'ats_integration', 'public_page', 'user_url', 'paste')", name='ck_discovery_sources_allowed_behavior'),
    sa.CheckConstraint("source_family IN ('licensed', 'employer_ats', 'public_career_page', 'user_provided')", name='ck_discovery_sources_family'),
    sa.CheckConstraint("terms_status IN ('pending', 'accepted', 'failed')", name='ck_discovery_sources_terms_status'),
    sa.CheckConstraint('rate_limit_per_minute > 0 AND rate_limit_per_minute <= 10000', name='ck_discovery_sources_rate_limit'),
    sa.CheckConstraint('retention_days > 0 AND retention_days <= 3650', name='ck_discovery_sources_retention_days'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_discovery_sources_source_key'), 'discovery_sources', ['source_key'], unique=True)
    op.create_table('application_details',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('full_name', sa.String(length=200), server_default='', nullable=False),
    sa.Column('email', sa.String(length=320), server_default='', nullable=False),
    sa.Column('phone', sa.String(length=50), server_default='', nullable=False),
    sa.Column('linkedin', sa.String(length=500), server_default='', nullable=False),
    sa.Column('website', sa.String(length=500), server_default='', nullable=False),
    sa.Column('location', sa.String(length=200), server_default='', nullable=False),
    sa.Column('work_authorization', sa.Text(), server_default='', nullable=False),
    sa.Column('visa_sponsorship', sa.Text(), server_default='', nullable=False),
    sa.Column('notice_period', sa.Text(), server_default='', nullable=False),
    sa.Column('salary_expectation', sa.Text(), server_default='', nullable=False),
    sa.Column('relocation', sa.Text(), server_default='', nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('application_preferences',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('keywords', sa.JSON(), nullable=False),
    sa.Column('locations', sa.JSON(), nullable=False),
    sa.Column('remote', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('max_per_run', sa.Integer(), server_default='5', nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('max_per_run >= 1 AND max_per_run <= 10', name='ck_application_preferences_max_per_run'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('cv_documents',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('source_import_id', sa.String(length=36), nullable=True),
    sa.Column('sections', sa.JSON(), nullable=False),
    sa.Column('style', sa.JSON(), nullable=True),
    sa.Column('tailoring_model_runs', sa.Integer(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'source_import_id', name='uq_cv_documents_user_import')
    )
    op.create_index(op.f('ix_cv_documents_user_id'), 'cv_documents', ['user_id'], unique=False)
    op.create_table('discovered_listing_attributions',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('listing_id', sa.String(), nullable=False),
    sa.Column('source_id', sa.String(), nullable=False),
    sa.Column('source_listing_key', sa.String(length=200), nullable=False),
    sa.Column('source_url', sa.String(length=2048), nullable=False),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['listing_id'], ['discovered_listings.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['source_id'], ['discovery_sources.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_id', 'source_listing_key', name='uq_discovered_listing_attribution_source_key')
    )
    op.create_index(op.f('ix_discovered_listing_attributions_listing_id'), 'discovered_listing_attributions', ['listing_id'], unique=False)
    op.create_index(op.f('ix_discovered_listing_attributions_source_id'), 'discovered_listing_attributions', ['source_id'], unique=False)
    op.create_table('discovery_dismissed_listings',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('listing_id', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['listing_id'], ['discovered_listings.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'listing_id', name='uq_discovery_dismissed_listing_owner')
    )
    op.create_index(op.f('ix_discovery_dismissed_listings_listing_id'), 'discovery_dismissed_listings', ['listing_id'], unique=False)
    op.create_index(op.f('ix_discovery_dismissed_listings_user_id'), 'discovery_dismissed_listings', ['user_id'], unique=False)
    op.create_table('evidence_items',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('kind', sa.String(), nullable=False),
    sa.Column('content', sa.JSON(), nullable=False),
    sa.Column('provenance', sa.String(), nullable=False),
    sa.Column('confirmation_state', sa.String(), server_default='unconfirmed', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("confirmation_state IN ('unconfirmed', 'confirmed')", name='ck_evidence_items_confirmation_state'),
    sa.CheckConstraint("kind IN ('experience', 'achievement', 'skill', 'education', 'project', 'certification', 'preference', 'interview-evidence')", name='ck_evidence_items_kind'),
    sa.CheckConstraint("provenance IN ('imported', 'inferred', 'user-entered')", name='ck_evidence_items_provenance'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_evidence_items_user_id'), 'evidence_items', ['user_id'], unique=False)
    op.create_table('cv_variants',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('document_id', sa.String(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('target_role', sa.String(length=200), nullable=True),
    sa.Column('tailoring_request_id', sa.String(length=36), nullable=True),
    sa.Column('sections', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['document_id'], ['cv_documents.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('document_id', 'name', name='uq_cv_variants_document_name'),
    sa.UniqueConstraint('document_id', 'tailoring_request_id', name='uq_cv_variants_document_tailoring_request')
    )
    op.create_index(op.f('ix_cv_variants_document_id'), 'cv_variants', ['document_id'], unique=False)
    op.create_table('application_snapshots',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('workspace_id', sa.String(), nullable=False),
    sa.Column('content_json', sa.Text(), nullable=False),
    sa.Column('content_sha256', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('workspace_id', name='uq_application_snapshot_workspace')
    )
    op.create_index(op.f('ix_application_snapshots_workspace_id'), 'application_snapshots', ['workspace_id'], unique=False)
    op.create_table('campaign_events',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('workspace_id', sa.String(), nullable=False),
    sa.Column('event_type', sa.String(length=32), nullable=False),
    sa.Column('details', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_campaign_events_workspace_id'), 'campaign_events', ['workspace_id'], unique=False)
    op.create_table('campaign_listings',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('workspace_id', sa.String(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('company', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('source_url', sa.String(length=2048), nullable=True),
    sa.Column('apply_url', sa.String(length=2048), nullable=True),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_campaign_listings_workspace_id'), 'campaign_listings', ['workspace_id'], unique=False)
    op.create_table('campaign_tasks',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('workspace_id', sa.String(), nullable=False),
    sa.Column('title', sa.String(length=240), nullable=False),
    sa.Column('deadline', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_campaign_tasks_workspace_id'), 'campaign_tasks', ['workspace_id'], unique=False)
    op.create_table('gap_classifications',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('workspace_id', sa.String(), nullable=False),
    sa.Column('finding_id', sa.String(), nullable=False),
    sa.Column('source_category', sa.String(), nullable=False),
    sa.Column('gap_kind', sa.String(), nullable=False),
    sa.Column('message', sa.String(), nullable=False),
    sa.Column('locations', sa.JSON(), nullable=False),
    sa.Column('cited_trace', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("gap_kind IN ('presentation_weakness', 'uncaptured_evidence', 'evidence_not_yet_produced', 'missing_skill')", name='ck_gap_classifications_gap_kind'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('workspace_id', 'finding_id', name='uq_gap_classifications_workspace_finding')
    )
    op.create_index(op.f('ix_gap_classifications_user_id'), 'gap_classifications', ['user_id'], unique=False)
    op.create_index(op.f('ix_gap_classifications_workspace_id'), 'gap_classifications', ['workspace_id'], unique=False)
    op.create_table('development_items',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('gap_classification_id', sa.String(), nullable=True),
    sa.Column('evidence_item_id', sa.String(), nullable=True),
    sa.Column('gap_kind', sa.String(), nullable=False),
    sa.Column('response_kind', sa.String(), nullable=False),
    sa.Column('state', sa.String(), server_default='planned', nullable=False),
    sa.Column('target_date', sa.Date(), nullable=True),
    sa.Column('notes', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("gap_kind IN ('presentation_weakness', 'uncaptured_evidence', 'evidence_not_yet_produced', 'missing_skill')", name='ck_development_items_gap_kind'),
    sa.CheckConstraint("response_kind IN ('reword', 'capture_evidence', 'produce_evidence', 'learn_skill')", name='ck_development_items_response_kind'),
    sa.CheckConstraint("state IN ('planned', 'in_progress', 'completed')", name='ck_development_items_state'),
    sa.ForeignKeyConstraint(['evidence_item_id'], ['evidence_items.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['gap_classification_id'], ['gap_classifications.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_development_items_evidence_item_id'), 'development_items', ['evidence_item_id'], unique=False)
    op.create_index(op.f('ix_development_items_gap_classification_id'), 'development_items', ['gap_classification_id'], unique=False)
    op.create_index(op.f('ix_development_items_user_id'), 'development_items', ['user_id'], unique=False)
    op.create_foreign_key('fk_tool_runs_parent_run_id', 'tool_runs', 'tool_runs', ['parent_run_id'], ['id'])
    op.execute("UPDATE users SET is_admin = false WHERE is_admin IS NULL")
    op.alter_column('users', 'is_admin',
               existing_type=sa.BOOLEAN(),
               nullable=False,
               existing_server_default=sa.text('false'))
    op.drop_constraint(op.f('uq_users_google_id'), 'users', type_='unique')
    op.drop_index(op.f('ix_users_google_id'), table_name='users')
    op.create_index(op.f('ix_users_google_id'), 'users', ['google_id'], unique=True)
    op.add_column('workspaces', sa.Column('discovery_listing_id', sa.String(), nullable=True))
    op.add_column('workspaces', sa.Column('company', sa.String(length=200), nullable=True))
    op.add_column('workspaces', sa.Column('role', sa.String(length=200), nullable=True))
    op.add_column('workspaces', sa.Column('status', sa.String(length=32), nullable=True))
    op.add_column('workspaces', sa.Column('deadline', sa.DateTime(timezone=True), nullable=True))
    op.add_column('workspaces', sa.Column('current_listing_id', sa.String(), nullable=True))
    op.add_column('workspaces', sa.Column('selected_cv_variant_id', sa.String(), nullable=True))
    op.add_column('workspaces', sa.Column('selected_cover_letter_run_id', sa.String(), nullable=True))
    op.add_column('workspaces', sa.Column('selected_interview_run_id', sa.String(), nullable=True))
    op.add_column('workspaces', sa.Column('drafts_run_id', sa.String(), nullable=True))
    op.add_column('workspaces', sa.Column('open_questions', sa.JSON(), server_default='[]', nullable=False))
    op.add_column('workspaces', sa.Column('answers', sa.JSON(), server_default='{}', nullable=False))
    op.add_column('workspaces', sa.Column('applied_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('workspaces', sa.Column('match_score', sa.Integer(), nullable=True))
    op.add_column('workspaces', sa.Column('notes', sa.Text(), nullable=True))
    op.create_index(op.f('ix_workspaces_discovery_listing_id'), 'workspaces', ['discovery_listing_id'], unique=False)
    op.create_unique_constraint('uq_workspace_owner_discovery_listing', 'workspaces', ['user_id', 'discovery_listing_id'])
    op.create_foreign_key('fk_workspaces_selected_cover_letter_run_id', 'workspaces', 'tool_runs', ['selected_cover_letter_run_id'], ['id'], ondelete='SET NULL', use_alter=True)
    op.create_foreign_key('fk_workspaces_selected_interview_run_id', 'workspaces', 'tool_runs', ['selected_interview_run_id'], ['id'], ondelete='SET NULL', use_alter=True)
    op.create_foreign_key('fk_workspaces_selected_cv_variant_id', 'workspaces', 'cv_variants', ['selected_cv_variant_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_workspaces_current_listing_id', 'workspaces', 'campaign_listings', ['current_listing_id'], ['id'], ondelete='SET NULL', use_alter=True)
    op.create_foreign_key('fk_workspaces_drafts_run_id', 'workspaces', 'tool_runs', ['drafts_run_id'], ['id'], ondelete='SET NULL', use_alter=True)
    op.create_check_constraint(
        'ck_workspaces_application_status',
        'workspaces',
        "status IS NULL OR status IN ('saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn')",
    )
    # CV variants are immutable snapshots: no UPDATE may rewrite them.
    op.execute(
        """
        CREATE FUNCTION prevent_cv_variant_update() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'CV variant snapshots are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER cv_variants_prevent_update
        BEFORE UPDATE ON cv_variants
        FOR EACH ROW EXECUTE FUNCTION prevent_cv_variant_update();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER cv_variants_prevent_update ON cv_variants")
    op.execute("DROP FUNCTION prevent_cv_variant_update()")
    op.drop_constraint('ck_workspaces_application_status', 'workspaces', type_='check')
    op.drop_constraint('fk_workspaces_drafts_run_id', 'workspaces', type_='foreignkey')
    op.drop_constraint('fk_workspaces_current_listing_id', 'workspaces', type_='foreignkey')
    op.drop_constraint('fk_workspaces_selected_cv_variant_id', 'workspaces', type_='foreignkey')
    op.drop_constraint('fk_workspaces_selected_interview_run_id', 'workspaces', type_='foreignkey')
    op.drop_constraint('fk_workspaces_selected_cover_letter_run_id', 'workspaces', type_='foreignkey')
    op.drop_constraint('uq_workspace_owner_discovery_listing', 'workspaces', type_='unique')
    op.drop_index(op.f('ix_workspaces_discovery_listing_id'), table_name='workspaces')
    op.drop_column('workspaces', 'notes')
    op.drop_column('workspaces', 'match_score')
    op.drop_column('workspaces', 'applied_at')
    op.drop_column('workspaces', 'answers')
    op.drop_column('workspaces', 'open_questions')
    op.drop_column('workspaces', 'drafts_run_id')
    op.drop_column('workspaces', 'selected_interview_run_id')
    op.drop_column('workspaces', 'selected_cover_letter_run_id')
    op.drop_column('workspaces', 'selected_cv_variant_id')
    op.drop_column('workspaces', 'current_listing_id')
    op.drop_column('workspaces', 'deadline')
    op.drop_column('workspaces', 'status')
    op.drop_column('workspaces', 'role')
    op.drop_column('workspaces', 'company')
    op.drop_column('workspaces', 'discovery_listing_id')
    op.drop_index(op.f('ix_users_google_id'), table_name='users')
    op.create_index(op.f('ix_users_google_id'), 'users', ['google_id'], unique=False)
    op.create_unique_constraint(op.f('uq_users_google_id'), 'users', ['google_id'], postgresql_nulls_not_distinct=False)
    op.alter_column('users', 'is_admin',
               existing_type=sa.BOOLEAN(),
               nullable=True,
               existing_server_default=sa.text('false'))
    op.drop_constraint('fk_tool_runs_parent_run_id', 'tool_runs', type_='foreignkey')
    op.drop_index(op.f('ix_development_items_user_id'), table_name='development_items')
    op.drop_index(op.f('ix_development_items_gap_classification_id'), table_name='development_items')
    op.drop_index(op.f('ix_development_items_evidence_item_id'), table_name='development_items')
    op.drop_table('development_items')
    op.drop_index(op.f('ix_gap_classifications_workspace_id'), table_name='gap_classifications')
    op.drop_index(op.f('ix_gap_classifications_user_id'), table_name='gap_classifications')
    op.drop_table('gap_classifications')
    op.drop_index(op.f('ix_campaign_tasks_workspace_id'), table_name='campaign_tasks')
    op.drop_table('campaign_tasks')
    op.drop_index(op.f('ix_campaign_listings_workspace_id'), table_name='campaign_listings')
    op.drop_table('campaign_listings')
    op.drop_index(op.f('ix_campaign_events_workspace_id'), table_name='campaign_events')
    op.drop_table('campaign_events')
    op.drop_index(op.f('ix_application_snapshots_workspace_id'), table_name='application_snapshots')
    op.drop_table('application_snapshots')
    op.drop_index(op.f('ix_cv_variants_document_id'), table_name='cv_variants')
    op.drop_table('cv_variants')
    op.drop_index(op.f('ix_evidence_items_user_id'), table_name='evidence_items')
    op.drop_table('evidence_items')
    op.drop_index(op.f('ix_discovery_dismissed_listings_user_id'), table_name='discovery_dismissed_listings')
    op.drop_index(op.f('ix_discovery_dismissed_listings_listing_id'), table_name='discovery_dismissed_listings')
    op.drop_table('discovery_dismissed_listings')
    op.drop_index(op.f('ix_discovered_listing_attributions_source_id'), table_name='discovered_listing_attributions')
    op.drop_index(op.f('ix_discovered_listing_attributions_listing_id'), table_name='discovered_listing_attributions')
    op.drop_table('discovered_listing_attributions')
    op.drop_index(op.f('ix_cv_documents_user_id'), table_name='cv_documents')
    op.drop_table('cv_documents')
    op.drop_table('application_preferences')
    op.drop_table('application_details')
    op.drop_index(op.f('ix_discovery_sources_source_key'), table_name='discovery_sources')
    op.drop_table('discovery_sources')
    op.drop_index(op.f('ix_discovered_listings_content_sha256'), table_name='discovered_listings')
    op.drop_table('discovered_listings')
